const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// Middlewares
// ==========================================
app.use(
  cors({
    origin: ["http://localhost:3000"],
  })
);

app.use(express.json());

// ==========================================
// MongoDB Connection
// ==========================================
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("bibliodrop");

    const booksCollection = db.collection("books");
    const usersCollection = db.collection("users");
    const deliveriesCollection = db.collection("deliveries");

    // ==========================================
    
    // ==========================================

    // Add Book
    app.post("/books", async (req, res) => {
      try {
        const bookData = req.body;
        console.log("Frontend থেকে এই ডাটা এসেছে: ", bookData);
        
        const newBook = {
          ...bookData,
          status: "Pending Approval",
          createdAt: new Date(),
        };

        const result = await booksCollection.insertOne(newBook);

        res.status(201).send({
          success: true,
          message: "Book added successfully!",
          data: result,
        });
      } catch (error) {
        console.error("Error adding book:", error);
        res.status(500).send({
          success: false,
          error: "Failed to add book",
        });
      }
    });

    // Get Published Books (With Pagination)
    app.get("/books", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 6;

        const query = { status: "Published" };

        const totalBooks = await booksCollection.countDocuments(query);

        const books = await booksCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .toArray();

        res.send({
          success: true,
          totalBooks, 
          data: books,
        });
      } catch (error) {
        console.error("Error fetching books:", error);
        res.status(500).send({
          success: false,
          error: "Failed to fetch books",
        });
      }
    });

    // Get Librarian Books
    app.get("/books/librarian/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const books = await booksCollection
          .find({ librarianEmail: email })
          .toArray();

        res.send({
          success: true,
          data: books,
        });
      } catch (error) {
        console.error("Error fetching librarian books:", error);
        res.status(500).send({
          success: false,
          error: "Failed to fetch librarian books",
        });
      }
    });

    // Get All Books (Admin)
    app.get("/books/admin/all", async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();

        res.send({
          success: true,
          data: books,
        });
      } catch (error) {
        console.error("Error fetching all books:", error);
        res.status(500).send({
          success: false,
          error: "Failed to fetch all books",
        });
      }
    });

    app.get("/books/admin/pending", async (req, res) => {
      try {
        const pendingBooks = await booksCollection.find({ status: "Pending Approval" }).toArray();
        res.send({ success: true, data: pendingBooks });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch pending books" });
      }
    });

    // Get Single Book by ID
    app.get("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }; 
        const book = await booksCollection.findOne(query);

        if (!book) {
          return res.status(404).send({ success: false, message: "Book not found" });
        }

        res.send({
          success: true,
          data: book,
        });
      } catch (error) {
        console.error("Error fetching single book:", error);
        res.status(500).send({
          success: false,
          error: "Failed to fetch book",
        });
      }
    });

    // Update Book Status
    app.patch("/books/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; 

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status },
        };

        const result = await booksCollection.updateOne(filter, updateDoc);

        res.send({
          success: true,
          message: `Book status updated to ${status}`,
          data: result,
        });
      } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).send({ success: false, error: "Failed to update status" });
      }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}

run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("BiblioDrop Server is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});