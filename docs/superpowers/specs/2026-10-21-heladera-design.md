# Heladera — documento de diseño

Fecha: 21/10/2026 · Estado: borrador para aprobar

## 1. Para qué existe

Todos los días aparece la misma pregunta: **"¿qué comemos hoy?"**. Pesa más a
la noche, cuando es tarde, hay hambre y uno quiere soluciones, no problemas. La
cabeza vuelve siempre a los mismos platos, aunque con lo que hay en la heladera
se podrían hacer muchos otros.

La app responde esa pregunta con lo que realmente hay en casa. Todo lo demás
(inventario, vencimientos, lista de compras, carga por ticket) existe para que
esa respuesta sea buena y para automatizar el ciclo diario/semanal de
"qué hay, qué falta, qué compramos".

**Usuarios:** primero una pareja que comparte la heladera y cocina a veces
junta y a veces por separado. Si funciona, se suman los hermanos y la mamá del
autor, cada uno con su hogar. Con ese feedback, quizás algún día sea un
producto. Hoy no lo es.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Abrir la app y tener un plato posible en segundos, sin buscar ni filtrar.
- Romper la repetición: sugerir platos que no se comieron hace tiempo.
- Aprovechar lo que está por pasarse.
- Que la lista de compras se arme sola y sea compartida.
- Que cargar lo comprado sea casi gratis en esfuerzo.

**No-objetivos (por ahora)**
- Cantidades en el inventario. Solo se registra si un producto **hay** o **no hay**.
  Las cantidades pueden llegar después, pensando en la lista de compras.
- Recomendaciones por dieta o nutrición. Se dio de baja explícitamente.
- IA paga, ya sea para recetas o para tickets. Se evalúa más adelante.
- Registro abierto de usuarios, pagos o multi-tenant comercial.
- Precios y gastos.

**Anti-objetivos (aunque funcione, sería un fracaso si…)**
- …la app hace trabajar al usuario a la noche: filtros, búsquedas, muchas decisiones.
- …el inventario deja de ser confiable y se abandona.
- …afecta a zona-fit: los datos o el acceso de Nadia.
- …genera un costo mensual.

## 3. Restricciones

- **Stack (decidido):** el mismo que `zona-fit` y `mama`: React 19 + Vite en JS
  plano, PWA mobile-first para iPhone, Supabase (Postgres + Auth) y GitHub Pages,
  más el workflow keep-alive. Valen las mismas convenciones: UI en español
  rioplatense, código en inglés, fechas DD/MM/YYYY y sin dependencias nuevas sin
  preguntar. **Excepción ya acordada:** se agrega una librería de OCR
  (Tesseract.js) para la etapa 4.
- **Supabase (decidido):** el plan gratis permite solo 2 proyectos y ya están en
  uso. La heladera vive **dentro del proyecto de zona-fit**, en un schema propio
  de Postgres llamado `heladera`. Comparten URL y key con zona-fit, y también los
  límites del plan gratis (500 MB de base). El keep-alive de zona-fit ya mantiene
  despierto el proyecto.
- **Sin registro:** los usuarios se crean a mano en Supabase, como en las otras
  apps. Con "Allow new users to sign up" desactivado.
- **Costo:** cero por mes.
- **Licencias de recetas:** ver §6. El uso personal o familiar está bien. El uso
  comercial no, sin reemplazar la fuente principal.

## 4. Seguridad y convivencia con zona-fit (etapa 1, antes que nada)

**Problema:** hoy todas las políticas RLS de zona-fit son
`for all to authenticated using (true)` (`zona-fit/supabase/schema.sql:518`).
Cualquier usuario logueado en el proyecto puede leer y escribir socios, pagos y
tienda. Cuando existan usuarios de la heladera, podrían hacerlo por la API.

**Decisión:** restricción simple. Se elige esto en lugar de retomar la rama
`cuenta-de-prueba` de zona-fit, que **no se borra**.
- Tabla nueva en zona-fit (en `public`) con los usuarios autorizados del
  gimnasio. *Mi propuesta:* `gym_users(user_id uuid primary key references auth.users)`.
- Todas las políticas pasan de `using (true)` a "el usuario está en `gym_users`",
  tanto en `using` como en `with check`.
- Se cumplen las reglas de zona-fit (`zona-fit/.claude/CLAUDE.md`): actualizar
  `schema.sql`, agregar `supabase/migrations/2026-10-XX-<nombre>.sql` y
  actualizar el README.

**Garantías (condiciones para aplicarla):**
1. La migración carga en `gym_users` **todos los usuarios que existen hoy** en
   `auth.users`: el del autor y el de Nadia. Lo hace dentro de la misma
   transacción y antes de cambiar las políticas.
2. Todo corre en una transacción. Si algo falla, no se aplica nada.
3. Se prueba antes en local con PGlite, como se hizo con la rama anterior.
4. Se entrega un script de vuelta atrás que restaura `using (true)`.
5. Después de aplicarla, Nadia abre la app y confirma que ve todo. **Recién
   entonces** se crea el primer usuario de la heladera.

**Ya verificado:** ninguna función de zona-fit es `security definer`, así que
todas respetan el nuevo RLS. `reset-test-data.sql` solo trunca tablas de
`public`, y el backup CSV exporta solo tablas de zona-fit.

**Reglas para la heladera, para no tocar zona-fit:**
- No modifica nada de `public`, salvo esta migración.
- No crea triggers sobre `auth.users`.
- Agrega `heladera` a "Exposed schemas" en Settings → API y da
  `grant usage on schema heladera to authenticated`.
- El cliente usa `createClient(url, key, { db: { schema: 'heladera' } })`.
- Antes de cargar el recetario se mide el tamaño actual de la base, para
  confirmar que entra en los 500 MB.

**Nota para el futuro:** si algún día se retoma `cuenta-de-prueba`, va a
chocar con esta migración y habrá que adaptarla.

## 5. Hogar y usuarios

- La unidad es el **hogar**, no la persona. Los miembros de un hogar comparten
  inventario, lista, historial y recetas propias.
- RLS en todas las tablas de `heladera`: solo se ve lo del propio hogar.
- Un usuario de zona-fit sin hogar no ve nada de la heladera. Un usuario de la
  heladera no está en `gym_users`, así que no ve nada de zona-fit.
- *Mi decisión:* los hogares y sus miembros se crean a mano con SQL en esta
  etapa. No hay pantallas de invitación.

## 6. Recetario (sin IA)

**Fuentes (decididas):**

| Fuente | Qué aporta | Licencia |
|---|---|---|
| [somosnlp/RecetasDeLaAbuela](https://huggingface.co/datasets/somosnlp/RecetasDeLaAbuela), config `version_1` | ~20.400 recetas en español, con país, duración, dificultad, porciones, tipo de plato y categoría | OpenRAIL. Las recetas se copiaron de sitios como recetasgratis.net, así que el uso comercial queda descartado |
| [peregrinogris/recetario](https://github.com/peregrinogris/recetario) | 38 recetas argentinas probadas | MIT |
| [peluso-cocina/recetario-culinario](https://github.com/peluso-cocina/recetario-culinario) | ~28 platos bien escritos | CC0 |

**Proceso único de preparación.** Corre una vez, durante la construcción. Es un
script en el repo (`scripts/`), y lo que genera se carga en la base:
- **Filtrar** a platos que sirvan para almuerzo o cena: plato principal o cena,
  dificultad baja o media, hasta ~60 min. Se espera que queden unos 2.000-3.000.
  Se descartan postres, salsas sueltas y tragos. **No se filtra por país
  (decidido):** se conservan las recetas de España, México, Perú, etc., por la
  variedad. Las que llevan ingredientes difíciles de conseguir casi nunca van a
  salir, porque solo se sugiere lo que se puede hacer con lo que hay.
- **Arreglar el texto roto.** En el dataset, "maíz" aparece como "maï¿½z".
- **Normalizar los ingredientes** contra un **diccionario de productos** propio:
  de "½ taza de cilantro finamente picado" queda "cilantro". El diccionario
  traduce el vocabulario de España al argentino (patata→papa, calabacín→zapallito,
  nata→crema, judía verde→chaucha, etc.). Es el mismo diccionario que usan la
  heladera, la lista de compras y el ticket.
- **Marcar cada ingrediente de receta** como principal o menor.
- *Mi decisión:* se adaptan al vocabulario argentino el título y la lista de
  ingredientes. El texto de los pasos queda como en el original.
- La normalización la hace Claude en las sesiones de construcción, y lo que
  produce queda guardado como datos. No se llama a ninguna IA mientras la app
  funciona.
- Se guarda la fuente y la URL de origen de cada receta.

**Diccionario de productos (mi decisión):**
- **Nivel genérico para cruzar con las recetas.** "Carne picada" y "nalga"
  cuentan como "carne de vaca", y "leche descremada" como "leche". La variante
  específica (lo que dice el ticket o lo que eligió el usuario) se guarda solo
  como etiqueta del producto en la heladera.
- **Productos nuevos.** Si un producto no existe en el diccionario, el hogar lo
  crea desde la app (nombre, categoría, duración típica, con valores por
  defecto de la categoría). Ese producto es **privado del hogar**, igual que los
  alias de ticket que apunten a él. El diccionario base se amplía en las
  sesiones de construcción.

**Básicos asumidos (mi decisión):** sal, pimienta, aceite y agua se consideran
siempre disponibles. La lista se puede editar por hogar.

**Recetario propio:** el hogar puede marcar recetas como favoritas y cargar las
suyas. Las propias y las favoritas tienen prioridad en las sugerencias.

## 7. Pantalla "¿Qué comemos hoy?" (inicio)

**Forma (decidida, opción B del boceto):** un plato por vez, en tarjeta grande.
Muestra nombre, tiempo y **por qué se sugiere** ("los huevos vencen en 2 días",
"no lo comen hace 3 semanas"). Swipe a la izquierda: otro plato. Swipe a la
derecha: ingredientes y pasos. Botones ✕/✓ como alternativa al gesto.

**Cómo elige (aprobado):**
1. Solo platos que se puedan hacer con lo que hay. Se tolera que falte **1
   ingrediente menor**, y se avisa.
2. Primero los que usan productos por vencer.
3. Después los que no se comieron hace tiempo.
4. Se penalizan los rechazados hace poco.
5. Las recetas propias y las favoritas suben.

*Mi decisión:* los rechazos y el historial de cocinados son **por hogar**, no
por persona. Si uno descarta un plato, baja también para el otro.

La fórmula exacta queda a criterio del builder. Tiene que ser simple y
explicable, porque el "por qué" se muestra en la tarjeta.

**"Lo cocinamos":** al tocarlo se registra el plato cocinado con su fecha, y la
app ofrece marcar como "se acabó" los ingredientes que usó. *(Mi decisión: lo
ofrece y no lo hace solo, porque sin cantidades no sabe si se terminó la docena
de huevos.)*

La pantalla abre sola al iniciar la app. Barra inferior: **Hoy · Heladera ·
Compras · Más**.

## 8. Heladera (inventario)

- Cada producto del diccionario está **presente o no**, sin cantidades.
- El producto guarda la fecha en que entró.
- **Vencimiento estimado:** cada producto del diccionario tiene una duración
  típica en días (verdura de hoja ~5, carne fresca ~3, yogur ~15, queso duro ~30).
  La app avisa "la lechuga está hace 6 días". Opcionalmente se puede corregir a
  mano el vencimiento de un producto. No se cargan fechas de envase.
- Marcar "se acabó" lo saca de la heladera y lo pasa a la lista de compras.
- El alcance (solo heladera, o también alacena y freezer) lo define el builder.
  Se recomienda un solo inventario con categoría, porque el arroz y los fideos
  importan para las recetas.

## 9. Cargar lo comprado

**Sin ticket (etapa 2):** verdulería, carnicería o cuando no hay ticket. Una
grilla de "lo que comprás seguido", más grupos por tipo de negocio y un
buscador. Se toca y se confirma con "Agregar N".

**Tachar en el súper (etapa 3):** lo que se tacha en la lista de compras entra
solo a la heladera.

**Con ticket (etapa 4):**
1. Se saca una foto al ticket. El OCR corre **en el celular** con Tesseract.js,
   en español. La foto no sale del teléfono.
2. Cada renglón leído se compara con el diccionario y con los alias aprendidos.
3. Se muestra una tarjeta por renglón, con el texto crudo
   ("LECHE LS ENT SACH 1L") y lo que se entendió ("Leche", con su duración).
   Swipe a la derecha: entra a la heladera. Swipe a la izquierda: no va
   (detergente, o algo mal leído). Si se toca la tarjeta, se corrige.
4. **Aprendizaje:** cada corrección queda guardada como alias
   (texto del ticket → producto). La próxima vez se reconoce sola.
   *(Mi decisión: los alias son compartidos entre hogares, porque los tickets del
   mismo súper se repiten.)*
5. Las líneas que no son productos (totales, IVA, descuentos, CUIT) se descartan
   antes del swipe.

Riesgo conocido: el OCR gratis lee mal los tickets térmicos arrugados. Por eso
va último, y el swipe con corrección es la red de seguridad. Si la precisión no
alcanza, la alternativa futura es la IA paga (§11).

## 10. Lista de compras (etapa 3)

Se arma sola con tres fuentes:
1. **Lo que se acabó** en la heladera.
2. **Lo habitual:** con el historial de compras se calcula cada cuánto se compra
   cada producto. Si ya pasó ese tiempo y no está en la heladera, se sugiere.
3. **Platos de la semana (opcional):** con swipe se eligen 3 o 4 platos para los
   próximos días, y se agrega lo que les falte.

Además, se pueden agregar productos a mano.

- Compartida y **en vivo** entre los miembros del hogar (Supabase Realtime).
- **Solo con conexión (decidido):** en el súper hay señal, así que no hace falta
  cola offline ni sincronización. Sin conexión se muestra el mismo aviso que en
  zona-fit.
- Cada ítem muestra por qué está ("se acabó", "lo comprás cada semana", "para el
  wok del jueves").
- Al tachar en el súper, el producto entra a la heladera (§9).

## 11. Etapas

Cada etapa queda usable por sí sola.

1. **Base.** Migración de seguridad en zona-fit (§4, con sus 5 garantías).
   Schema `heladera`, hogar y miembros, login, esqueleto de la PWA con la barra
   inferior y deploy a GitHub Pages.
   *Listo cuando:* Nadia confirma que zona-fit anda igual, y los dos usuarios del
   hogar entran y ven la app vacía.
2. **Lo central.** Script del recetario y diccionario de productos cargados.
   Pantalla Heladera con carga manual y "se acabó". "¿Qué comemos hoy?" con
   swipe, "Lo cocinamos" e historial. Favoritas y recetas propias.
   *Listo cuando:* una noche real, la app propone un plato que se puede hacer con
   lo que hay, y no es "lo de siempre".
3. **Lista de compras** (§10) y tachar en el súper.
4. **Ticket** (§9) con OCR, swipe y alias.

**Para más adelante, fuera de este diseño:** cantidades, IA paga (Claude API con
clave propia, guardada en una Edge Function), invitaciones a otros hogares de la
familia y dieta, solo si se retoma.

## 12. Qué queda a criterio del builder

- El modelo de datos exacto. Conceptos mínimos: hogar, miembros, productos del
  diccionario (categoría, duración, sinónimos), heladera, recetas,
  ingredientes de receta (principal o menor), cocinados, rechazados, favoritas,
  lista de compras, historial de compras y alias de ticket.
- La fórmula de puntaje de §7.
- La estructura de carpetas, siguiendo el patrón de zona-fit
  (`src/lib`, `src/screens`, `src/components`, `supabase/schema.sql`,
  `supabase/migrations/`).
- El diseño visual. Los bocetos de inicio y de carga sirven como referencia de
  estructura, no de estilo.
- Cómo se cargan los datos del recetario: SQL generado, CSV u otro formato.
- Cómo se cargan los datos de idioma del OCR (bajo demanda, para no inflar la PWA).
