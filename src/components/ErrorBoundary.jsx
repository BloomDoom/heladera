import { Component } from 'react'

// If a bug makes a screen crash, React would show a blank white page.
// This catches the crash and shows a plain message instead.
// (Error boundaries are the one thing React still needs a class for.)
export default class ErrorBoundary extends Component {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error) {
    console.error(error) // for you, in the browser console
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <main className="screen center">
        <h1>Algo salió mal</h1>
        <p>Tus datos guardados están bien. Tocá el botón para empezar de nuevo.</p>
        <button
          className="btn-primary"
          onClick={() => {
            window.location.hash = '#/'
            window.location.reload()
          }}
        >
          Empezar de nuevo
        </button>
      </main>
    )
  }
}
