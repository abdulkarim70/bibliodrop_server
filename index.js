const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // Stripe

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
    const usersCollection = db.collection("user");
    const deliveriesCollection = db.collection("deliveries");
    const reviewsCollection = db.collection("reviews"); // রিভিউ এর জন্য ভেরিয়েবল যোগ করা হলো

    // ==========================================
    // Books APIs
    // ==========================================

    // 1. Add Book
    app.post("/books", async (req, res) => {
      try {
        const bookData = req.body;
        
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
        res.status(500).send({ success: false, error: "Failed to add book" });
      }
    });

    // 2. Get Published Books (With Pagination)
    app.get("/books", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 6;

        const query = { status: "Published" };
        const totalBooks = await booksCollection.countDocuments(query);
        const books = await booksCollection.find(query).skip(page * size).limit(size).toArray();

        res.send({ success: true, totalBooks, data: books });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch books" });
      }
    });

    // 3. Get Librarian Books
    app.get("/books/librarian/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const books = await booksCollection.find({ librarianEmail: email }).toArray();
        res.send({ success: true, data: books });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch librarian books" });
      }
    });

// ==========================================
    // Admin APIs: View All Transactions (Updated with $lookup)
    // ==========================================
    app.get("/admin/transactions", async (req, res) => {
      try {
        // $lookup ব্যবহার করে deliveries কালেকশনের সাথে user কালেকশন জয়েন করা হয়েছে
        const transactions = await deliveriesCollection.aggregate([
          {
            $lookup: {
              from: "user",           // user কালেকশন থেকে ডাটা খুঁজবে
              localField: "userEmail", // deliveries কালেকশনের ইমেইল ফিল্ড
              foreignField: "email",   // user কালেকশনের ইমেইল ফিল্ড
              as: "userDetails"        // সাময়িকভাবে এই নামে ডাটা রাখবে
            }
          },
          {
            $addFields: {
              // যদি আগে থেকে userName থাকে তবে সেটাই থাকবে, না থাকলে user কালেকশন থেকে name এনে বসাবে
              userName: {
                $ifNull: [
                  "$userName",
                  { $arrayElemAt: ["$userDetails.name", 0] }
                ]
              }
            }
          },
          {
            // অতিরিক্ত ফিল্ডটি বাদ দিয়ে ফ্রন্টএন্ডে পাঠানো হচ্ছে
            $project: {
              userDetails: 0
            }
          }
        ]).toArray();

        res.send({ success: true, data: transactions });
      } catch (error) {
        console.error("Error fetching all transactions:", error);
        res.status(500).send({ success: false, error: "Failed to fetch transactions" });
      }
    });




    // 4. Get All Books (Admin)
    app.get("/books/admin/all", async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();
        res.send({ success: true, data: books });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch all books" });
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

    // 6. Get Single Book by ID
    app.get("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }; 
        const book = await booksCollection.findOne(query);

        if (!book) {
          return res.status(404).send({ success: false, message: "Book not found" });
        }
        res.send({ success: true, data: book });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch book" });
      }
    });

    // 7. Update Book Status
    app.patch("/books/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; 

        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };

        const result = await booksCollection.updateOne(filter, updateDoc);
        res.send({ success: true, message: `Book status updated to ${status}`, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to update status" });
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
        res.send({ success: true, message: "Book updated successfully!", data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to update book details" });
      }
    });

    // 9. Delete Book
    app.delete("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);
        res.send({ success: true, message: "Book deleted successfully!", data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to delete book" });
      }
    });

    // ==========================================
    // Stripe Payment Intent API
    // ==========================================
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { deliveryFee } = req.body;
        const amount = parseInt(deliveryFee * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ success: true, clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Stripe Intent Error:", error);
        res.status(500).send({ success: false, error: "Payment failed to initialize" });
      }
    });

    // ==========================================
    // Deliveries APIs
    // ==========================================

    // Save Delivery Record API
    app.post("/deliveries", async (req, res) => {
      try {
        const deliveryData = req.body;
        
        const result = await deliveriesCollection.insertOne({
          ...deliveryData,
          status: "Pending Delivery",
          createdAt: new Date()
        });

        const filter = { _id: new ObjectId(deliveryData.bookId) };
        const updateDoc = { $set: { status: "Checked Out" } };
        await booksCollection.updateOne(filter, updateDoc);

        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to save delivery record" });
      }
    });

    // Get Specific User's Deliveries
    app.get("/deliveries/user/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const deliveries = await deliveriesCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: deliveries });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch user deliveries" });
      }
    });

    // Get Specific Librarian's Deliveries
    app.get("/deliveries/librarian/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const deliveries = await deliveriesCollection.find({ librarianEmail: email }).toArray();
        res.send({ success: true, data: deliveries });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch librarian deliveries" });
      }
    });

    // Update Delivery Status (Librarian marking as delivered)
    app.patch("/deliveries/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };

        const result = await deliveriesCollection.updateOne(filter, updateDoc);
        res.send({ success: true, message: "Delivery status updated successfully!", data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to update delivery status" });
      }
    });

    // ==========================================
    // Reviews APIs
    // ==========================================

    // ১. নির্দিষ্ট কোনো বইয়ের জন্য রিভিউ পোস্ট করা
    app.post("/reviews", async (req, res) => {
      try {
        const reviewData = req.body;
        const result = await reviewsCollection.insertOne({
          ...reviewData,
          createdAt: new Date()
        });
        res.status(201).send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to add review" });
      }
    });

    // ২. নির্দিষ্ট ইউজারের দেওয়া সমস্ত রিভিউ তুলে আনা
    app.get("/reviews/user/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: reviews });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch reviews" });
      }
    });

    // ==========================================
    // Admin Analytics & Stats API (মাসিক আয়ের হিসাব সহ)
    // ==========================================
    app.get("/admin/stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        
        const books = await booksCollection.find().toArray();
        const totalBooks = books.length;

        const categoryCount = {};
        books.forEach((book) => {
          const cat = book.category || "General";
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });

        const chartData = Object.keys(categoryCount).map((key) => ({
          name: key,
          value: categoryCount[key],
        }));

        const deliveries = await deliveriesCollection.find().toArray();
        const totalDeliveries = deliveries.length;

        let totalRevenue = 0;
        const monthlyRevenueMap = {};

        deliveries.forEach(del => {
          if (del.fee) {
            totalRevenue += del.fee;
            
            const dateObj = new Date(del.createdAt || del.date);
            if (!isNaN(dateObj)) {
              const monthName = dateObj.toLocaleString("en-US", { month: "short", year: "numeric" });
              monthlyRevenueMap[monthName] = (monthlyRevenueMap[monthName] || 0) + del.fee;
            }
          }
        });

        const monthlyRevenueData = Object.keys(monthlyRevenueMap).map(key => ({
          name: key,
          revenue: monthlyRevenueMap[key]
        }));

        res.send({
          success: true,
          data: {
            totalUsers,
            totalBooks,
            totalDeliveries,
            totalRevenue,
            chartData,
            monthlyRevenueData
          }
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ success: false, error: "Failed to fetch stats" });
      }
    });

    // ==========================================
    // Admin APIs: Manage Users
    // ==========================================
    
    // ১. সব ইউজারদের তালিকা আনা
    app.get("/admin/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send({ success: true, data: users });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to fetch users" });
      }
    });

    // ২. ইউজারের রোল আপডেট করা
    app.patch("/admin/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        
        const filter = { _id: id.length === 24 ? new ObjectId(id) : id };
        const updateDoc = { $set: { role: role } };
        
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send({ success: true, message: "Role updated successfully", data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to update role" });
      }
    });

    // ৩. ইউজার ডিলিট করা
    app.delete("/admin/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: id.length === 24 ? new ObjectId(id) : id };
        
        const result = await usersCollection.deleteOne(filter);
        res.send({ success: true, message: "User deleted successfully", data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: "Failed to delete user" });
      }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}

run().catch(console.dir);

// ==========================================
// Root Route
// ==========================================
app.get("/", (req, res) => {
  res.send("BiblioDrop Server is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});