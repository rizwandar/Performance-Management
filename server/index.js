const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173'
}));
app.use(express.json());

app.use('/api/employees', require('./routes/employees'));
app.use('/api/cycles', require('./routes/cycles'));
app.use('/api/deezer', require('./routes/deezer'));

app.get('/', (req, res) => res.json({ status: 'Performance API running' }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
