# ¿Qué es Biconic? — Guía del proyecto

Este documento explica **para qué sirve** esta aplicación, **qué problemas resuelve** y **cómo se usa** en el día a día, sin entrar en detalles técnicos.

---

## En una frase

**Biconic** es una plataforma que permite **traer datos desde las bases de datos de tus clientes a un solo lugar**, **organizarlos** y **mostrarlos en tableros visuales** (gráficos, números clave y tablas) para que puedas analizarlos y tomar decisiones.

---

## ¿A quién va dirigida?

Va dirigida a **empresas o equipos** que:

- Trabajan con **varios clientes** y cada uno tiene sus propios sistemas o bases de datos.
- Necesitan **unificar** esa información en un solo sitio.
- Quieren **ver la información en dashboards**: ventas, facturación, tiendas, productos, etc.
- Necesitan **compartir** esos reportes con clientes o con el equipo (incluso por enlace, sin que tengan que iniciar sesión).

Es decir: **gestión de datos y reportes para múltiples clientes**, desde una sola plataforma.

---

## ¿Qué se puede hacer con la aplicación?

### 1. Gestionar clientes

La aplicación trabaja con **clientes**. Un cliente es la empresa o la cuenta a la que pertenecen los datos y los reportes. Desde el panel de administración puedes:

- Ver la lista de clientes.
- Crear y editar clientes.
- Asignar a cada cliente sus ETLs y sus dashboards.

Todo lo que crees (conexiones, ETLs, dashboards) puede asociarse a uno o varios clientes para mantener la información ordenada.

---

### 2. Conexiones a bases de datos

Las **conexiones** son el “puente” entre Biconic y las bases de datos donde están los datos reales (por ejemplo, el sistema de ventas o de facturación del cliente).

- Puedes crear varias conexiones (una por base de datos o por sistema).
- La aplicación soporta distintos tipos de bases de datos (por ejemplo MySQL, PostgreSQL, Firebird).
- Esas conexiones las usa después el proceso ETL para **leer** los datos desde el origen.

En resumen: **conexión = acceso autorizado a una base de datos externa** para poder extraer datos.

---

### 3. ETL (Extraer, Transformar, Cargar)

**ETL** es el proceso que hace que los datos “lleguen” desde las bases de datos de tus clientes hasta la plataforma.

- **Extraer**: se conecta a la base de datos de origen (usando una conexión) y lee las tablas y columnas que tú eliges.
- **Transformar**: puedes elegir qué columnas usar y aplicar filtros (por ejemplo, solo cierto rango de fechas o solo ciertos productos).
- **Cargar**: los datos se guardan en el almacén central de la plataforma, listos para usarlos en los dashboards.

Cada ETL se puede asignar a un **cliente**. Puedes tener varios ETLs por cliente (por ejemplo, uno para ventas y otro para facturación). También puedes **ejecutar** el ETL cuando quieras para actualizar los datos.

En la práctica: **ETL = “tarea programada” que trae y guarda datos desde el sistema del cliente hacia Biconic.**

---

### 4. Monitores (historial de ejecuciones)

Los **monitores** muestran qué ha pasado con las ejecuciones de los ETLs:

- Cuáles se han ejecutado correctamente.
- Cuáles han fallado y por qué (para poder corregir).
- Cuáles están en curso.

Así puedes revisar que los datos se estén actualizando bien y actuar si algo falla.

---

### 5. Dashboards (tableros de visualización)

Los **dashboards** son los tableros donde **se ve** la información: gráficos, números destacados (KPIs), tablas y filtros.

- Se construyen a partir de los **datos que ya han cargado los ETLs** (ventas, facturación, tiendas, productos, etc.).
- Puedes elegir qué tipo de gráfico usar (barras, líneas, pastel, etc.), qué métricas mostrar y cómo filtrar.
- Un dashboard puede estar en **borrador** (solo tú lo ves) o **publicado** (visible para quien tenga permiso o el enlace).
- Puedes **compartir** un dashboard por **enlace**: quien tenga el enlace puede verlo **sin iniciar sesión** (vista pública).

En resumen: **dashboard = reporte visual** que muestra los datos de tus ETLs de forma clara y actualizada.

---

### 6. Usuarios, roles y planes

La aplicación distingue entre:

- **Administradores**: gestionan todo (clientes, conexiones, ETLs, dashboards, usuarios, planes).
- **Creadores**: pueden crear y editar dashboards (y lo que permita su rol).
- **Visualizadores**: suelen tener acceso de solo lectura a dashboards y datos.

También hay **planes** (gestión de planes), que permiten ofrecer distintos niveles de servicio (por ejemplo, por número de clientes o de dashboards).

Todo esto sirve para **repartir responsabilidades** y que no todo el mundo tenga que ser administrador.

---

## Flujo típico de uso

1. **Dar de alta un cliente** en la plataforma.
2. **Crear una conexión** a la base de datos de ese cliente (o usar una ya existente).
3. **Crear un ETL** para ese cliente: elegir conexión, tabla, columnas y filtros, y la tabla destino donde se guardarán los datos.
4. **Ejecutar el ETL** (y repetir cuando quieras actualizar los datos).
5. **Crear un dashboard** que use esos datos: elegir gráficos, KPIs y filtros.
6. **Publicar** el dashboard y, si hace falta, **compartir el enlace** con el cliente o con tu equipo.

Los **monitores** te permiten revisar que los ETLs se ejecuten bien y corregir errores.

---

## Resumen visual de “para qué sirve”

| Parte de la app   | ¿Para qué sirve?                                                                 |
|-------------------|-----------------------------------------------------------------------------------|
| **Clientes**      | Organizar datos y reportes por empresa o cuenta.                                 |
| **Conexiones**    | Conectar con las bases de datos donde están los datos (origen).                  |
| **ETL**           | Traer esos datos a la plataforma de forma controlada (extraer, filtrar, cargar). |
| **Monitores**     | Ver si las cargas de datos han ido bien o han fallado.                            |
| **Dashboards**    | Ver los datos en gráficos y tablas; compartir reportes por enlace si quieres.     |
| **Usuarios/Planes** | Definir quién hace qué y qué nivel de servicio tiene cada uno.                 |

---

## Conclusión

**Biconic** sirve para **centralizar datos de varias fuentes (bases de datos de tus clientes)**, **mantenerlos actualizados** mediante ETLs y **mostrarlos en dashboards** que puedes compartir con clientes o con tu equipo. Está pensada para quien necesita **un solo lugar** donde ver y analizar la información de múltiples clientes o sistemas.

Si quieres detalles de instalación, despliegue o tecnología, puedes consultar el `README.md` y la documentación técnica del proyecto.
