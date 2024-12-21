const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;
const app = express();

// const corsOptions = {
//   origin: ['http://localhost:5173'],
//   credentials: true,
//   optionalsSuccessStatus: 200,
// };
// app.use(cors(corsOptions));
// app.use(express.json());
// app.use(cookieParser());
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.WORK_USER}:${process.env.WORK_PASS}@cluster0.whh17.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    // console.log('Valid Token:', decoded);
    next();
  } catch (err) {
    console.error('Invalid Token:', err.message);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};

async function run() {
  try {
    const db = client.db('solo-db');
    const jobCollection = db.collection('jobs');
    const bidsCollection = db.collection('bids');
    //generate jwt
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      //creact token
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: '2d',
      });
      res.cookie('token', token, {
        httpOnly: true,
        secure: (process.env.NODE_ENV = 'producation'),
        sameSite: (process.env.NODE_ENV = 'producation' ? 'none' : 'strict'),
      });
      res.send({ success: true });
    });

    //logout clear cookie from brwoser
    app.get('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: (process.env.NODE_ENV = 'producation'),
        sameSite: (process.env.NODE_ENV = 'producation' ? 'none' : 'strict'),
      });
      res.send({ success: true });
    });

    // save a jobData in db
    app.post('/add-job', async (req, res) => {
      const jobData = req.body;
      const result = await jobCollection.insertOne(jobData);
      console.log(result);
      res.send(result);
    });

    // get all jobs data from db
    app.get('/jobs', async (req, res) => {
      const result = await jobCollection.find().toArray();
      res.send(result);
    });

    // get all jobs posted by a specific user
    app.get('/jobs/:email', async (req, res) => {
      const email = req.params.email;
      const query = { 'buyer.email': email };
      const result = await jobCollection.find(query).toArray();
      res.send(result);
    });

    // delete a job from db
    app.delete('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.deleteOne(query);
      res.send(result);
    });

    // get a single job data by id from db
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.findOne(query);
      res.send(result);
    });

    // save a jobData in db
    app.put('/update-job/:id', async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const updated = {
        $set: jobData,
      };
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const result = await jobCollection.updateOne(query, updated, options);
      console.log(result);
      res.send(result);
    });
    //bids jobs
    app.post('/add-bid', async (req, res) => {
      const bidData = req.body;
      const query = { email: bidData.email, jobId: bidData.jobId };
      const alreadyExist = await bidsCollection.findOne(query);
      if (alreadyExist)
        return res
          .status(400)
          .send('you have already placed on this bids jobs');
      const result = await bidsCollection.insertOne(bidData);
      const filter = { _id: new ObjectId(bidData.jobId) };
      const update = {
        $inc: { bid_count: 1 },
      };
      const updateBidCount = await jobCollection.updateOne(filter, update);
      console.log(result);
      res.send(result);
    });
    //get all bids
    app.get('/bids/:email', verifyToken, async (req, res) => {
      const isBuyer = req.query.buyer;

      const email = req.params.email;

      let query = {};
      if (isBuyer) {
        query.buyer = email;
      } else {
        query.email = email;
      }

      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });
    //buyert requst
    app.get('/bid-requests/:email', verifyToken, async (req, res) => {
      const decodedEmail = req.user?.email;
      const email = req.params.email;
      const query = { buyer: email };
      console.log('email from token', decodedEmail);
      console.log('email params', email);
      if (decodedEmail !== email) {
        return res.status(401).send({ message: 'Unauthorized' });
      }
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });
    //update bite status
    app.patch('/bid-status-update/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      console.log(status);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status } };
      const result = await bidsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //get all jobs
    app.get('/all-jobs', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const sort = req.query.sort;
      let query = {};

      if (filter) query.category = filter;
      if (search) query.title = { $regex: search, $options: 'i' };
      let sortOrder = {};
      if (sort) {
        if (sort === 'asc') {
          sortOrder.price = 1;
        } else if (sort === 'desc') {
          sortOrder.price = -1;
        }
      }

      const result = await jobCollection
        .find(query, sortOrder)

        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....');
});

app.listen(port, () => console.log(`Server running on port ${port}`));
