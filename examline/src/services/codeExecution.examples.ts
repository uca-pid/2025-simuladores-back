/**
 * Ejemplos de código para probar el servicio de ejecución
 */

// ============================================
// PYTHON - Casos de prueba
// ============================================

// 1. Hello World
const pythonHelloWorld = `
print("Hello, World!")
print("Segunda línea")
`;

// 2. Operaciones matemáticas
const pythonMath = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(f"Fibonacci({i}) = {fibonacci(i)}")
`;

// 3. Manejo de entrada (stdin no disponible por ahora)
const pythonInput = `
# Este código fallará porque no hay stdin
# nombre = input("¿Cuál es tu nombre? ")
# print(f"Hola, {nombre}!")

# Alternativa sin input:
nombre = "Usuario"
print(f"Hola, {nombre}!")
`;

// 4. Error de sintaxis
const pythonSyntaxError = `
print("Inicio")
if True
    print("Error de sintaxis - falta :")
`;

// 5. Error de runtime
const pythonRuntimeError = `
print("Inicio")
resultado = 10 / 0  # Division por cero
print("Esto no se ejecutará")
`;

// 6. Timeout (código que demora mucho)
const pythonTimeout = `
import time
print("Iniciando espera...")
time.sleep(15)  # Más de 10 segundos = timeout
print("Esto no se ejecutará")
`;

// 7. Uso de librerías estándar
const pythonLibraries = `
import math
import datetime

print(f"Pi: {math.pi}")
print(f"e: {math.e}")
print(f"sqrt(16): {math.sqrt(16)}")
print(f"Fecha actual: {datetime.datetime.now()}")
`;

// 8. Estructuras de datos
const pythonDataStructures = `
# Listas
numeros = [1, 2, 3, 4, 5]
print(f"Lista: {numeros}")
print(f"Suma: {sum(numeros)}")

# Diccionarios
persona = {
    "nombre": "Juan",
    "edad": 25,
    "ciudad": "Buenos Aires"
}
print(f"Persona: {persona}")

# Sets
conjunto = {1, 2, 3, 3, 4, 5}
print(f"Set (sin duplicados): {conjunto}")
`;

// ============================================
// JAVASCRIPT - Casos de prueba
// ============================================

// 1. Hello World
const jsHelloWorld = `
console.log("Hello, World!");
console.log("Segunda línea");
`;

// 2. Operaciones matemáticas
const jsMath = `
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n-1) + fibonacci(n-2);
}

for (let i = 0; i < 10; i++) {
    console.log(\`Fibonacci(\${i}) = \${fibonacci(i)}\`);
}
`;

// 3. Error de sintaxis
const jsSyntaxError = `
console.log("Inicio");
if (true) {
    console.log("Falta cerrar llave"
}
`;

// 4. Error de runtime
const jsRuntimeError = `
console.log("Inicio");
const obj = null;
console.log(obj.propiedad);  // Error: Cannot read property
`;

// 5. Timeout
const jsTimeout = `
console.log("Iniciando espera...");
const start = Date.now();
while (Date.now() - start < 15000) {
    // Loop infinito por 15 segundos
}
console.log("Esto no se ejecutará");
`;

// 6. Uso de APIs modernas
const jsModern = `
// Arrow functions
const suma = (a, b) => a + b;
console.log("Suma:", suma(5, 3));

// Template literals
const nombre = "JavaScript";
console.log(\`Hola desde \${nombre}\`);

// Destructuring
const persona = { nombre: "Juan", edad: 25 };
const { nombre: n, edad } = persona;
console.log(\`\${n} tiene \${edad} años\`);

// Spread operator
const arr1 = [1, 2, 3];
const arr2 = [...arr1, 4, 5];
console.log("Array expandido:", arr2);
`;

// 7. Async/Await (cuidado con timeouts)
const jsAsync = `
// Promesas
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log("Inicio");
    await esperar(1000);  // 1 segundo está OK
    console.log("Después de 1 segundo");
}

main();
`;

// 8. Clases
const jsClasses = `
class Persona {
    constructor(nombre, edad) {
        this.nombre = nombre;
        this.edad = edad;
    }
    
    saludar() {
        return \`Hola, soy \${this.nombre} y tengo \${this.edad} años\`;
    }
}

const juan = new Persona("Juan", 25);
console.log(juan.saludar());
`;

// ============================================
// CASOS DE PRUEBA PARA EXÁMENES
// ============================================

// Ejercicio: Calcular factorial
const ejercicioFactorial = `
def factorial(n):
    """Calcula el factorial de n"""
    if n <= 1:
        return 1
    return n * factorial(n - 1)

# Tests
assert factorial(0) == 1, "factorial(0) debería ser 1"
assert factorial(1) == 1, "factorial(1) debería ser 1"
assert factorial(5) == 120, "factorial(5) debería ser 120"
assert factorial(10) == 3628800, "factorial(10) debería ser 3628800"

print("✓ Todos los tests pasaron!")
`;

// Ejercicio: Palíndromo
const ejercicioPalindromo = `
def es_palindromo(texto):
    """Verifica si un texto es palíndromo"""
    # Remover espacios y convertir a minúsculas
    texto = texto.replace(" ", "").lower()
    return texto == texto[::-1]

# Tests
assert es_palindromo("ana") == True
assert es_palindromo("Anita lava la tina") == True
assert es_palindromo("hola") == False
assert es_palindromo("A man a plan a canal Panama") == True

print("✓ Todos los tests pasaron!")
`;

// Ejercicio: FizzBuzz
const ejercicioFizzBuzz = `
def fizzbuzz(n):
    """Retorna FizzBuzz para números del 1 al n"""
    resultado = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            resultado.append("FizzBuzz")
        elif i % 3 == 0:
            resultado.append("Fizz")
        elif i % 5 == 0:
            resultado.append("Buzz")
        else:
            resultado.append(str(i))
    return resultado

# Mostrar primeros 15
for i, valor in enumerate(fizzbuzz(15), 1):
    print(f"{i}: {valor}")
`;

export const ejemplosPython = {
    helloWorld: pythonHelloWorld,
    math: pythonMath,
    input: pythonInput,
    syntaxError: pythonSyntaxError,
    runtimeError: pythonRuntimeError,
    timeout: pythonTimeout,
    libraries: pythonLibraries,
    dataStructures: pythonDataStructures,
};

export const ejemplosJavaScript = {
    helloWorld: jsHelloWorld,
    math: jsMath,
    syntaxError: jsSyntaxError,
    runtimeError: jsRuntimeError,
    timeout: jsTimeout,
    modern: jsModern,
    async: jsAsync,
    classes: jsClasses,
};

export const ejercicios = {
    factorial: ejercicioFactorial,
    palindromo: ejercicioPalindromo,
    fizzBuzz: ejercicioFizzBuzz,
};
