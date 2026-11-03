import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createApi } from './api';
import './styles.css';
const runtime = createApi();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App {...runtime}/></React.StrictMode>);
