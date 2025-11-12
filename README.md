# 🔍 Filtro de Campañas

Extensión de Chrome para filtrar y monitorear campañas de aplicaciones móviles en las plataformas de Movizzon. Proporciona una interfaz moderna y eficiente para gestionar y analizar múltiples campañas de monitoreo.

## ✨ Características

### 🎯 Filtros Avanzados
- **Filtro por Campaña**: Busca campañas por nombre o código
- **Filtro por Macro**: Busca macros por número (ej: 7398) o nombre (ej: "Transferencia A Terceros")
- **Filtro por Keyword**: Busca palabras clave en el contenido de las filas
- **Filtro por IMEI**: Filtra por los últimos 4 dígitos del IMEI
- **Filtro por Severidad**: Filtra por estado (Crítico/Rojo, Advertencia/Naranja, Éxito/Verde)
- **Filtro de Caídos**: Muestra solo dispositivos con más de 30 minutos sin medir
- **Filtro por Último Evento**: Filtra por tiempo mínimo desde el último evento

### 🎨 Interfaz Moderna
- Panel lateral deslizable con diseño glassmorphism
- Resaltado visual de elementos críticos, advertencias y caídos
- Animaciones suaves y transiciones elegantes
- Botón flotante para abrir/cerrar el panel
- Resumen en tiempo real de campañas y filas visibles

### 💾 Persistencia de Estado
- Guarda el estado de los filtros en sesión
- Recuerda la posición del scroll
- Mantiene el estado del panel (abierto/cerrado)
- Persistencia del estado activo/inactivo de la extensión

### 🔄 Actualización en Tiempo Real
- Los filtros se aplican automáticamente mientras escribes
- Actualización instantánea de estadísticas
- Resaltado dinámico de celdas según su estado

## 📦 Instalación

### Instalación Manual

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Trianaaa/Filtro_extension.git
   cd Filtro_extension
   ```

2. **Abrir Chrome y acceder a las extensiones**
   - Abre Chrome y ve a `chrome://extensions/`
   - O navega a: Menú → Más herramientas → Extensiones

3. **Activar el modo desarrollador**
   - Activa el interruptor "Modo de desarrollador" en la esquina superior derecha

4. **Cargar la extensión**
   - Haz clic en "Cargar extensión sin empaquetar"
   - Selecciona la carpeta del proyecto `Filtro_extension`

5. **Verificar la instalación**
   - La extensión debería aparecer en la barra de herramientas
   - Verifica que el ícono esté visible

## 🚀 Uso

### Activar/Desactivar la Extensión

1. Haz clic en el ícono de la extensión en la barra de herramientas
2. Usa el interruptor para activar o desactivar la extensión
3. El estado se guarda automáticamente

### Usar el Panel de Filtros

1. **Abrir el panel**
   - Haz clic en el botón flotante (lupa) en la página de monitoreo
   - O usa el ícono de la extensión en la barra de herramientas

2. **Aplicar filtros**
   - Escribe en los campos de búsqueda para filtrar automáticamente
   - Selecciona severidades usando los botones de color
   - Activa "Solo caídos" para ver solo dispositivos caídos
   - Ajusta el rango de último evento con el slider

3. **Ver resultados**
   - Las campañas y filas se filtran en tiempo real
   - Las estadísticas se actualizan automáticamente
   - Los elementos se resaltan según su estado

4. **Limpiar filtros**
   - Haz clic en el botón "Limpiar" para resetear todos los filtros
   - O cierra y vuelve a abrir el panel

### Filtros Específicos

#### Filtro de Macros
- Busca por número de macro: `7398`
- Busca por nombre: `Transferencia`
- Busca en enlaces, URLs y texto completo del bloque de campaña

#### Filtro de Caídos
- Muestra dispositivos con más de 30 minutos sin medir
- Resalta elementos críticos con animación pulsante
- Calcula el threshold según la repetición configurada

#### Filtro por Severidad
- **Rojo**: Errores críticos (>= 80% de error)
- **Naranja**: Advertencias (>= 50% de error)
- **Verde**: Éxito (sin errores)

## 🛠️ Tecnologías

- **Manifest V3**: Última versión de la API de extensiones de Chrome
- **Vanilla JavaScript**: Sin dependencias externas
- **CSS3**: Animaciones, gradientes y efectos glassmorphism
- **Chrome Storage API**: Persistencia de estado
- **Chrome Scripting API**: Inyección de scripts y estilos

## 📁 Estructura del Proyecto

```
Filtro_extension/
├── manifest.json          # Configuración de la extensión
├── background.js          # Service worker para gestión de estado
├── content.js             # Script principal de filtrado
├── popup.html             # Interfaz del popup
├── popup.js               # Lógica del popup
├── popup.css              # Estilos del popup
├── styles.css             # Estilos del panel de filtros
├── logo.png               # Ícono de la extensión
├── lupa.png               # Ícono del botón flotante
├── x.png                  # Ícono de cerrar
└── README.md              # Este archivo
```

## 🎨 Características de Diseño

### Panel de Filtros
- Diseño glassmorphism con efecto de vidrio esmerilado
- Gradientes modernos y sombras suaves
- Animaciones de entrada/salida
- Responsive y adaptable

### Resaltado Visual
- **Rojo**: Errores críticos con gradiente rojo
- **Naranja**: Advertencias con gradiente naranja
- **Verde**: Éxito con gradiente verde
- **Caído**: Elementos caídos con animación pulsante

### Interacciones
- Debounce en campos de búsqueda para mejor rendimiento
- Transiciones suaves entre estados
- Feedback visual en botones y controles
- Tooltips y labels descriptivos

## 🔧 Configuración

### Permisos Requeridos
- `storage`: Para guardar el estado de la extensión
- `scripting`: Para inyectar scripts en las páginas
- `tabs`: Para gestionar pestañas y URLs

### URLs Soportadas
- `https://mantenedornuevo.movizzon.com/appMonitors*`
- `https://mantenedor.movizzon.com/appMonitors*`

## 📝 Notas de Desarrollo

### Lógica de Filtrado
- Los filtros se aplican de forma combinada (AND lógico)
- La búsqueda de macros busca en múltiples ubicaciones:
  - Enlaces de macros del bloque de campaña
  - Texto completo del bloque de campaña
  - Filas de la tabla
  - Atributos href y onclick

### Detección de Caídos
- Un dispositivo se considera caído si lleva más de 30 minutos sin medir
- El threshold se calcula según la repetición configurada
- Se buscan celdas de último evento de forma robusta

### Parseo de Tiempo
- Soporta múltiples formatos: "0 D - 0 H - 6 M", "45 M", "1 H 30 M"
- Normaliza guiones y espacios
- Convierte todo a minutos para comparación

## 🐛 Solución de Problemas

### La extensión no aparece
- Verifica que el modo desarrollador esté activado
- Asegúrate de cargar la carpeta correcta
- Recarga la extensión desde `chrome://extensions/`

### Los filtros no funcionan
- Verifica que estés en una URL soportada
- Asegúrate de que la extensión esté activa
- Recarga la página después de instalar la extensión

### El panel no se abre
- Verifica que el botón flotante esté visible
- Intenta hacer clic en el ícono de la extensión
- Verifica la consola del navegador para errores

## 📄 Licencia

Este proyecto es privado y está destinado para uso interno.

## 👤 Autor

Desarrollado para Movizzon

## 🔄 Versión

Versión 1.0

---

**Nota**: Esta extensión está diseñada específicamente para las plataformas de monitoreo de Movizzon. No funcionará en otras páginas web.
