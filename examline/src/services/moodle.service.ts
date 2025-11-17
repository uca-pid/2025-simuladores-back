/**
 * Moodle Integration Service
 * Servicio para integrar Examline con Moodle Web Services
 * Documentación: https://docs.moodle.org/dev/Web_services
 */

interface MoodleConfig {
  moodleUrl: string;
  wsToken: string;
}

interface MoodleGrade {
  studentId: string; // Moodle user ID o email o idnumber
  grade: number; // Calificación (0-100)
  studentEmail?: string;
}

interface MoodleResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: any;
}

class MoodleService {
  /**
   * Llama a una función de Moodle Web Services
   */
  private async callMoodleWebService(
    config: MoodleConfig,
    wsFunction: string,
    params: Record<string, any>
  ): Promise<any> {
    const url = new URL(`${config.moodleUrl}/webservice/rest/server.php`);
    url.searchParams.append('wstoken', config.wsToken);
    url.searchParams.append('wsfunction', wsFunction);
    url.searchParams.append('moodlewsrestformat', 'json');

    // Agregar parámetros
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'object') {
        // Manejar arrays y objetos para Moodle
        this.appendObjectParams(url.searchParams, key, value);
      } else {
        url.searchParams.append(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Verificar si Moodle devolvió un error
      if (data.exception) {
        throw new Error(data.message || 'Error en Moodle Web Service');
      }

      return data;
    } catch (error: any) {
      console.error('Error calling Moodle Web Service:', error);
      throw new Error(`Error conectando con Moodle: ${error.message}`);
    }
  }

  /**
   * Helper para construir parámetros de array/objeto para Moodle
   */
  private appendObjectParams(
    searchParams: URLSearchParams,
    prefix: string,
    obj: any
  ): void {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (typeof item === 'object') {
          this.appendObjectParams(searchParams, `${prefix}[${index}]`, item);
        } else {
          searchParams.append(`${prefix}[${index}]`, String(item));
        }
      });
    } else if (typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === 'object') {
          this.appendObjectParams(searchParams, `${prefix}[${key}]`, value);
        } else {
          searchParams.append(`${prefix}[${key}]`, String(value));
        }
      });
    }
  }

  /**
   * Obtener información del usuario de Moodle por email
   */
  async getMoodleUserByEmail(
    config: MoodleConfig,
    email: string
  ): Promise<any> {
    try {
      const result = await this.callMoodleWebService(
        config,
        'core_user_get_users_by_field',
        {
          field: 'email',
          'values[0]': email,
        }
      );

      return result && result.length > 0 ? result[0] : null;
    } catch (error: any) {
      console.error('Error getting Moodle user:', error);
      throw error;
    }
  }

  /**
   * Enviar una calificación a un item del gradebook de Moodle
   * Usa mod_assign_save_grade para tareas (assignments)
   */
  async sendGradeToAssignment(
    config: MoodleConfig,
    assignmentId: number,
    moodleUserId: number,
    grade: number
  ): Promise<MoodleResponse> {
    try {
      // Moodle espera grades en el formato que usa internamente
      // Para assignments, generalmente es sobre 100
      const result = await this.callMoodleWebService(
        config,
        'mod_assign_save_grade',
        {
          assignmentid: assignmentId,
          userid: moodleUserId,
          grade: grade,
          attemptnumber: -1, // -1 = última entrega
          addattempt: 0,
          workflowstate: 'released', // Hacer visible la nota
          applytoall: 0,
        }
      );

      return {
        success: true,
        message: 'Calificación enviada exitosamente',
        details: result,
      };
    } catch (error: any) {
      console.error('Error sending grade to Moodle assignment:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Enviar calificación usando gradereport_user_update_grade
   * (Método más general que funciona con cualquier item del gradebook)
   */
  async sendGradeToGradebook(
    config: MoodleConfig,
    courseId: number,
    itemId: number,
    moodleUserId: number,
    grade: number
  ): Promise<MoodleResponse> {
    try {
      const result = await this.callMoodleWebService(
        config,
        'core_grades_update_grades',
        {
          source: 'mod/examline', // Identificador de la fuente
          courseid: courseId,
          component: 'mod_assign', // o el componente correspondiente
          activityid: itemId,
          itemnumber: 0,
          'grades[0][studentid]': moodleUserId,
          'grades[0][grade]': grade,
        }
      );

      return {
        success: true,
        message: 'Calificación enviada exitosamente',
        details: result,
      };
    } catch (error: any) {
      console.error('Error sending grade to Moodle gradebook:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Enviar múltiples calificaciones (batch)
   */
  async sendBulkGrades(
    config: MoodleConfig,
    assignmentId: number,
    grades: MoodleGrade[]
  ): Promise<MoodleResponse[]> {
    const results: MoodleResponse[] = [];

    for (const gradeData of grades) {
      try {
        // Primero obtener el Moodle user ID por email si no está presente
        let moodleUserId: number;

        if (gradeData.studentEmail) {
          const moodleUser = await this.getMoodleUserByEmail(
            config,
            gradeData.studentEmail
          );

          if (!moodleUser) {
            results.push({
              success: false,
              error: `Usuario no encontrado en Moodle: ${gradeData.studentEmail}`,
            });
            continue;
          }

          moodleUserId = moodleUser.id;
        } else {
          moodleUserId = parseInt(gradeData.studentId);
        }

        // Enviar calificación
        const result = await this.sendGradeToAssignment(
          config,
          assignmentId,
          moodleUserId,
          gradeData.grade
        );

        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Verificar que el token de Moodle es válido
   */
  async verifyMoodleConnection(config: MoodleConfig): Promise<MoodleResponse> {
    try {
      const result = await this.callMoodleWebService(
        config,
        'core_webservice_get_site_info',
        {}
      );

      return {
        success: true,
        message: 'Conexión con Moodle exitosa',
        details: {
          sitename: result.sitename,
          username: result.username,
          userid: result.userid,
          release: result.release,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Error conectando con Moodle: ${error.message}`,
      };
    }
  }

  /**
   * Obtener información de un curso de Moodle
   */
  async getCourseInfo(
    config: MoodleConfig,
    courseId: number
  ): Promise<any> {
    try {
      const result = await this.callMoodleWebService(
        config,
        'core_course_get_courses',
        {
          'options[ids][0]': courseId,
        }
      );

      return result && result.length > 0 ? result[0] : null;
    } catch (error: any) {
      console.error('Error getting course info:', error);
      throw error;
    }
  }

  /**
   * Obtener assignments de un curso
   */
  async getCourseAssignments(
    config: MoodleConfig,
    courseId: number
  ): Promise<any[]> {
    try {
      console.log('🔍 Buscando assignments para curso:', courseId);
      
      const result = await this.callMoodleWebService(
        config,
        'mod_assign_get_assignments',
        {
          'courseids[0]': courseId,
        }
      );

      console.log('📦 Respuesta de Moodle:', JSON.stringify(result, null, 2));

      // Verificar estructura de respuesta
      if (!result) {
        console.log('⚠️ Respuesta vacía de Moodle');
        return [];
      }

      if (result.exception) {
        console.error('❌ Error de Moodle:', result.message);
        throw new Error(result.message || 'Error en Moodle Web Service');
      }

      if (!result.courses || result.courses.length === 0) {
        console.log('⚠️ No se encontraron cursos en la respuesta');
        return [];
      }

      const assignments = result.courses[0].assignments || [];
      console.log(`✅ Se encontraron ${assignments.length} assignments`);
      
      return assignments;
    } catch (error: any) {
      console.error('❌ Error getting course assignments:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Obtener todas las actividades/módulos de un curso (alternativa más general)
   */
  async getCourseContents(
    config: MoodleConfig,
    courseId: number
  ): Promise<any[]> {
    try {
      console.log('🔍 Buscando contenidos del curso:', courseId);
      
      const result = await this.callMoodleWebService(
        config,
        'core_course_get_contents',
        {
          courseid: courseId,
        }
      );

      console.log('📦 Contenidos obtenidos:', result ? result.length : 0, 'secciones');

      // Extraer todos los módulos/actividades de todas las secciones
      const activities: any[] = [];
      
      if (Array.isArray(result)) {
        result.forEach((section: any) => {
          if (section.modules && Array.isArray(section.modules)) {
            section.modules.forEach((module: any) => {
              // Solo incluir actividades que pueden tener calificaciones
              if (module.modname === 'assign' || 
                  module.modname === 'quiz' || 
                  module.modname === 'workshop') {
                activities.push({
                  id: module.instance || module.id,
                  name: module.name,
                  type: module.modname,
                  cmid: module.id // course module id
                });
              }
            });
          }
        });
      }

      console.log(`✅ Se encontraron ${activities.length} actividades con calificaciones`);
      return activities;
    } catch (error: any) {
      console.error('❌ Error getting course contents:', error);
      throw error;
    }
  }
}

export default MoodleService;
