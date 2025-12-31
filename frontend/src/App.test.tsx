// Temporary test file - if App.tsx isn't working, try this
import React from 'react'

function AppTest() {
  return (
    <div style={{ 
      padding: '40px', 
      fontFamily: 'sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#333' }}>React is Working! ✅</h1>
      <p style={{ color: '#666' }}>If you see this, React is rendering correctly.</p>
      <p style={{ color: '#666' }}>Now let's check why the main app isn't loading...</p>
      <div style={{ 
        marginTop: '20px', 
        padding: '20px', 
        backgroundColor: 'white', 
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h2>Next Steps:</h2>
        <ol>
          <li>Open browser console (F12)</li>
          <li>Check for any red error messages</li>
          <li>Go back to App.tsx and see what's different</li>
        </ol>
      </div>
    </div>
  )
}

export default AppTest

