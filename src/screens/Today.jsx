// "¿Qué comemos hoy?": the screen the app opens on. The dish suggestions
// arrive in stage 2, with the recipes.
export default function Today() {
  return (
    <main className="screen">
      <h1>¿Qué comemos hoy?</h1>
      <p className="empty">Todavía no hay recetas. Llegan en la próxima etapa.</p>
    </main>
  )
}
