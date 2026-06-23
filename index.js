const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// Middlewares
// ==========================================
app.use(cors({
  origin: ['http://localhost:3000'], // আপনার ফ্রন্টএন্ডের লোকালহোস্ট লিংক
  credentials: true // কুকি আদান-প্রদানের জন্য এটি বাধ্যতামুলক
}));
app.use(express.json());
app.use(cookieParser()); // কুকি পড়ার জন্য

// ==========================================
// Custom Middleware: Token Verification
// ==========================================
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded; // টোকেন সঠিক হলে ইউজারের তথ্য রিকোয়েস্টে সেভ করে দিলাম
    next(); // গার্ড পাস করে ভেতরে যাওয়ার অনুমতি দিলাম
  });
};

// ==========================================
// MongoDB Connection
// ==========================================
const uri = process.env.MONGODB_URI;

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
    // await client.connect(); // (ঐচ্ছিক: Vercel-এ ডেপ্লয় করার সময় এটি কমেন্ট আউট রাখতে হয়)
    
    const db = client.db("BiblioDrop");
    const booksCollection = db.collection("books");
    const usersCollection = db.collection("users"); // ভবিষ্যতের জন্য
    const deliveriesCollection = db.collection("deliveries"); // ভবিষ্যতের জন্য

    // ==========================================
    // Auth & JWT APIs
    // ==========================================
    
    // ১. টোকেন তৈরি করা (লগিন করার সময় কল হবে)
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1d' });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    // ২. টোকেন ক্লিয়ার করা (লগআউট করার সময় কল হবে)
    app.post('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    // ==========================================
    // Books APIs
    // ==========================================

    // ৩. নতুন বই আপলোড করা (Protected)
    app.post('/books', verifyToken, async (req, res) => {
      try {
        const bookData = req.body;
        const newBook = {
          ...bookData,
          status: "Pending Approval", // ডিফল্ট স্ট্যাটাস
          createdAt: new Date()
        };

        const result = await booksCollection.insertOne(newBook);
        res.status(201).send({ success: true, message: "Book added successfully!", data: result });
      } catch (error) {
        console.error("Error adding book:", error);
        res.status(500).send({ error: "Failed to add book" });
      }
    });

    // ৪. পাবলিশড হওয়া সব বই দেখা (Public - Home & Browse Page)
    app.get('/books', async (req, res) => {
      try {
        const query = { status: "Published" };
        const books = await booksCollection.find(query).toArray();
        res.send({ success: true, data: books });
      } catch (error) {
        console.error("Error fetching published books:", error);
        res.status(500).send({ error: "Failed to fetch books" });
      }
    });

    // ৫. লাইব্রেরিয়ানের নিজের আপলোড করা বই দেখা (Protected)
    app.get('/books/librarian/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        
        // সিকিউরিটি: অন্য কেউ যেন অন্যের বই দেখতে না পারে
        if (req.user.email !== email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }

        const query = { librarianEmail: email }; 
        const books = await booksCollection.find(query).toArray();
        res.send({ success: true, data: books });
      } catch (error) {
        console.error("Error fetching librarian books:", error);
        res.status(500).send({ error: "Failed to fetch librarian books" });
      }
    });

    // ৬. অ্যাডমিনের জন্য সব বই দেখা (Protected)
    app.get('/books/admin/all', verifyToken, async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();
        res.send({ success: true, data: books });
      } catch (error) {
        console.error("Error fetching all books for admin:", error);
        res.status(500).send({ error: "Failed to fetch all books" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
  } finally {
    // await client.close(); 
  }
}
run().catch(console.dir);

// Root API
app.get('/', (req, res) => {
  res.send('BiblioDrop Server is running securely!')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});