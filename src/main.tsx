import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/base.css'
import './styles/app.css'
import './styles/pages.css'
// transitions.dev 微交互层放最后，确保 t-* recipe 覆盖基础层里的旧动画
import './styles/transitions.css'
// v2.2 移动端 dock：必须在最后，覆盖旧 tab / pill 规则
import './styles/dock-v22.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
