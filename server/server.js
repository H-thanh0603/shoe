const express = require('express')
const path = require('node:path')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// API
app.use('/api/products', require('./routes/products.js'))
app.use('/api', require('./routes/meta.js'))

// static frontend (dist/) — build root trước: npm run build
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`server: http://localhost:${PORT}`))
