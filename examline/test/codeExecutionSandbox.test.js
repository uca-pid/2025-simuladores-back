import {
  argumentosContenedor,
  modoEjecucion,
  verificarEjecucionCodigo,
  IMAGENES_SANDBOX
} from '../src/services/codeExecution.service.ts';

// El modo contenedor (EJECUCION_CODIGO=podman|docker) no corre en Render ni en el CI,
// así que se verifica cómo se arma el comando: si alguien cambia la ejecución y rompe
// el aislamiento, estos tests lo marcan aunque la flag esté apagada.

describe('modoEjecucion', () => {
  const original = process.env.EJECUCION_CODIGO;
  afterEach(() => {
    if (original === undefined) delete process.env.EJECUCION_CODIGO;
    else process.env.EJECUCION_CODIGO = original;
  });

  it('por defecto ejecuta local', () => {
    delete process.env.EJECUCION_CODIGO;
    expect(modoEjecucion()).toBe('local');
  });

  it('acepta podman y docker sin importar mayúsculas', () => {
    process.env.EJECUCION_CODIGO = 'PODMAN';
    expect(modoEjecucion()).toBe('podman');
    process.env.EJECUCION_CODIGO = ' docker ';
    expect(modoEjecucion()).toBe('docker');
  });

  it('un valor desconocido vuelve a local', () => {
    process.env.EJECUCION_CODIGO = 'kubernetes';
    expect(modoEjecucion()).toBe('local');
  });

  it('en modo local el chequeo de arranque no exige nada', async () => {
    delete process.env.EJECUCION_CODIGO;
    await expect(verificarEjecucionCodigo()).resolves.toBe('local');
  });
});

describe('argumentosContenedor', () => {
  const lenguajes = ['python', 'javascript', 'c'];

  it.each(lenguajes)('%s: corre aislado (sin red, solo lectura, sin permisos, con límites)', (lenguaje) => {
    const args = argumentosContenedor(lenguaje, '/tmp/exec_x', 'examline-exec-abc', 'code.ext');

    expect(args.slice(0, 3)).toEqual(['run', '--rm', '-i']);
    expect(args).toContain('--network=none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
    expect(args).toContain('--pids-limit=64');
    expect(args.some(a => a.startsWith('--memory='))).toBe(true);
    expect(args.some(a => a.startsWith('--memory-swap='))).toBe(true);
    expect(args.some(a => a.startsWith('--cpus='))).toBe(true);
    // código y datasets montados de solo lectura
    expect(args[args.indexOf('-v') + 1]).toBe('/tmp/exec_x:/code:ro');
    expect(args[args.indexOf('--name') + 1]).toBe('examline-exec-abc');
    expect(args).toContain(IMAGENES_SANDBOX[lenguaje]);
  });

  it('python y javascript no pueden ejecutar binarios en /tmp', () => {
    for (const lenguaje of ['python', 'javascript']) {
      const tmpfs = argumentosContenedor(lenguaje, '/d', 'n', 'code.py').find(a => a.startsWith('--tmpfs='));
      expect(tmpfs).not.toContain('exec');
    }
  });

  it('c compila y ejecuta en /tmp, separando el error de compilación', () => {
    const args = argumentosContenedor('c', '/d', 'n', 'code.c');
    expect(args.find(a => a.startsWith('--tmpfs='))).toContain('exec');
    const script = args[args.length - 1];
    expect(script).toContain('gcc /code/code.c -o /tmp/code.out -lm');
    expect(script).toContain('##ERROR_DE_COMPILACION##');
    expect(script).toContain('exec /tmp/code.out');
  });

  it('javascript limita la memoria de Node', () => {
    const args = argumentosContenedor('javascript', '/d', 'n', 'code.js');
    expect(args.some(a => a.startsWith('--max-old-space-size='))).toBe(true);
    expect(args[args.length - 1]).toBe('/code/code.js');
  });
});
