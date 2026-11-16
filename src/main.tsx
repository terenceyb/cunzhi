import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/base.css'
import './styles/app.css'
import './styles/pages.css'
// transitions.dev 微交互层放最后，确保 t-* recipe 覆盖基础层里的旧动画
import './styles/transitions.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
