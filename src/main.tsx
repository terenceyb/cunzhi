import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/base.css'
import './styles/app.css'
import './styles/pages.css'
// transitions.dev 微交互层放最后，确保 t-* recipe 覆盖基础层里的旧动画
import './styles/transitions.css'
// v2.6 Apple 设计语言覆盖层：只改视觉，放最末以覆盖前几轮的同名规则
import './styles/apple.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
