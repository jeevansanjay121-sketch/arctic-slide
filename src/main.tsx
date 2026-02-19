import React from 'react'
import ReactDOM from 'react-dom/client'
import ArcticSlide from './ArcticSlide' // No .tsx at the end
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ArcticSlide />
  </React.StrictMode>,
)