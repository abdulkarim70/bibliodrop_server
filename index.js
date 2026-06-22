const express = require('express');
const cors = require('cors'); // ফ্রন্টএন্ডের সাথে কানেক্ট করার জন্য
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json()); 

const uri = process.env.MONGODB_URI;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect to the database
    await client.connect();
    
    
    const db = client.db("BiblioDrop");
    const booksCollection = db.collection("books");

    // ==========================================
    // API Route: Add a new book (POST /books)
    // ==========================================
    app.post('/books', async (req, res) => {
      try {
        const bookData = req.body;

       
        const newBook = {
          ...bookData,
          status: "Pending Approval",
          createdAt: new Date()
        };

        const result = await booksCollection.insertOne(newBook);
        
        res.status(201).send({ 
          success: true, 
          message: "Book added successfully!", 
          data: result 
        });

      } catch (error) {
        console.error("Error adding book:", error);
        res.status(500).send({ error: "Failed to add book" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
  } finally {
    // Ensures that the client will close when you finish/error
    // 
    // await client.close(); 
  }
}
run().catch(console.dir);

// Root API
app.get('/', (req, res) => {
  res.send('BiblioDrop Server is running!')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});