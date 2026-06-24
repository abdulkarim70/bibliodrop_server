const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); //stripe

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
    // Books APIs
    // ==========================================

    // 1. Add Book
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

    // 2. Get Published Books (With Pagination)
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

    // 3. Get Librarian Books
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

    // 4. Get All Books (Admin)
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

    // 5. Get Pending Books (Admin)
    app.get("/books/admin/pending", async (req, res) => {
      try {
        const pendingBooks = await booksCollection.find({ status: "Pending Approval" }).toArray();
        res.send({ success: true, data: pendingBooks });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch pending books" });
      }
    });

    // 6. Get Single Book by ID (অবশ্যই pending রাউটের নিচে থাকতে হবে)
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

    // 7. Update Book Status (Publish, Unpublish, Checked Out)
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


    // ==========================================
    // Stripe Payment Intent API
    // ==========================================
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { deliveryFee } = req.body;
        
        // Stripe টাকার হিসাব সেন্ট (cents/পয়সা) এ করে। তাই ডলারকে 100 দিয়ে গুণ করতে হবে।
        const amount = parseInt(deliveryFee * 100);

        // Payment Intent তৈরি করা
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          success: true,
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Stripe Intent Error:", error);
        res.status(500).send({ success: false, error: "Payment failed to initialize" });
      }
    });

    // ==========================================
    // Save Delivery Record API
    // ==========================================
    app.post("/deliveries", async (req, res) => {
      try {
        const deliveryData = req.body;
        
        // deliveries কালেকশনে ডেটা সেভ করা
        const result = await deliveriesCollection.insertOne({
          ...deliveryData,
          status: "Pending Delivery", // প্রাথমিক স্ট্যাটাস
          createdAt: new Date()
        });

        // একইসাথে বইয়ের স্ট্যাটাস আপডেট করে "Checked Out" করে দেওয়া
        const filter = { _id: new ObjectId(deliveryData.bookId) };
        const updateDoc = { $set: { status: "Checked Out" } };
        await booksCollection.updateOne(filter, updateDoc);

        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to save delivery record" });
      }
    });

    // 8. Edit / Update Book Details (Librarian)
    app.patch("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        const filter = { _id: new ObjectId(id) };
        
        const updateDoc = {
          $set: {
            title: updatedData.title,
            author: updatedData.author,
            category: updatedData.category,
            deliveryFee: updatedData.deliveryFee,
            description: updatedData.description,
            ...(updatedData.image && { image: updatedData.image })
          },
        };

        const result = await booksCollection.updateOne(filter, updateDoc);

        res.send({
          success: true,
          message: "Book updated successfully!",
          data: result,
        });
      } catch (error) {
        console.error("Error updating book:", error);
        res.status(500).send({ success: false, error: "Failed to update book details" });
      }
    });

    // 9. Delete Book (Librarian & Admin)
    app.delete("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);

        res.send({
          success: true,
          message: "Book deleted successfully!",
          data: result,
        });
      } catch (error) {
        console.error("Error deleting book:", error);
        res.status(500).send({ success: false, error: "Failed to delete book" });
      }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}

run().catch(console.dir);


// ==========================================
    // Get Specific User's Deliveries
    // ==========================================
    app.get("/deliveries/user/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const deliveries = await deliveriesCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: deliveries });
      } catch (error) {
        console.error("Error fetching user deliveries:", error);
        res.status(500).send({ success: false, error: "Failed to fetch deliveries" });
      }
    });

// ==========================================
// Root Route
// ==========================================
app.get("/", (req, res) => {
  res.send("BiblioDrop Server is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});