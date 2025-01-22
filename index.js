require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vyhfd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    const postCollection = client.db("tagTalksDb").collection("posts");
    const userCollection = client.db("tagTalksDb").collection("users");
    const commentCollection = client.db("tagTalksDb").collection("comments");
    const paymentCollection = client.db("tagTalksDb").collection("payments");

    try {

        //------------JWT related APIs------------
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2hr' });

            res.send({ token })
        })

        //middleware (FOR TOKEN VERIFICATION)----------->>>
        const verifyToken = (req, res, next) => {
            
            console.log('Inside verify token :', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            // //verify the token
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decode) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decode = decode;
                next();
            })

            // next();

        }

        // middleware: verify admin after get verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decode.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next()

        }

        // Get all posts
        app.get('/post', async (req, res) => {
            const page = parseInt(req.query.page) || 0;
            const size = parseInt(req.query.size) || 5;
            const result = await postCollection.find()
                .skip(page * size)
                .limit(size)
                .sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // get post by tags
        app.get('/post/:tag', async (req, res) => {
            const tag = req.params.tag;
            const query = { tag: tag };
            const result = await postCollection.find(query).toArray();
            res.send(result);
        })

        // Create a new post
        app.post('/post', async (req, res) => {
            const postData = req.body;
            postData.createdAt = new Date();
            postData.upVote = 0; // Initialize upVote
            postData.downVote = 0; // Initialize downVote
            const result = await postCollection.insertOne(postData);
            res.send(result);
        });

        // Database Total posts 
        app.get('/postsCount', async (req, res) => {
            const count = await postCollection.estimatedDocumentCount();
            res.send({ count });
        })

        app.get('/recentPost/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await postCollection.find(query).limit(3).toArray()
            res.send(result);
        })

        // get a specific user's all posts
        app.get('/posts/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await postCollection.find(query).toArray();
            res.send(result);
        })

        //delete a post
        app.delete('/post/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await postCollection.deleteOne(query);
            res.send(result);
        })

        // count individual user's post
        app.get('/post/user/count/:email', async (req, res) => {
            const { email } = req.params;
            const count = await postCollection.countDocuments({ email });
            res.send({ count });
        })

        // popular post 
        app.get('/popular-post', async (req, res) => {
            const result = await postCollection.aggregate([
                // add popularity field
                {
                    $addFields: {
                        popularity: { $subtract: ["$upVote", "$downVote"] }
                    }
                },
                { $sort: { popularity: -1 } } // Sorting
            ]).toArray();
            res.send(result);

        })

        // ----------comments related APIs-------------------->
        // post comment
        app.post('/comments', async (req, res) => {
            const commentInfo = req.body;
            const result = await commentCollection.insertOne(commentInfo);

            res.send(result);
        })
        // get comments
        app.get('/comments', async (req, res) => {
            const result = await commentCollection.find().toArray();
            res.send(result);
        })

        // Count total comments by postId
        app.get('/comments/count/:postId', async (req, res) => {
            const { postId } = req.params;

            const count = await commentCollection.countDocuments({ postId });
            res.send({ commentCount: count });
        });




        // Upvote a post
        app.patch('/post/:id/upvote', async (req, res) => {
            const { id } = req.params;
            const { email } = req.body; // The email of the user making the request

            if (!email) {
                return res.status(400).send({ error: 'User email is required to vote' });
            }

            try {
                // Find the post
                const post = await postCollection.findOne({ _id: new ObjectId(id) });

                if (!post) {
                    return res.status(404).send({ error: 'Post not found' });
                }

                // Check if the email already exists in the votedBy array
                if (post.votedBy?.includes(email)) {
                    return res.status(403).send({ error: 'You have already voted on this post' });
                }

                // Add the email to the votedBy array and increment the upVote count
                const result = await postCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $inc: { upVote: 1 },
                        $push: { votedBy: email },
                    }
                );

                res.send(result);
            } catch (error) {
                console.error('Error updating upvote:', error);
                res.status(500).send({ error: 'Failed to upvote post' });
            }
        });

        // Downvote a post
        app.patch('/post/:id/downvote', async (req, res) => {
            const { id } = req.params;
            const { email } = req.body; // The email of the user making the request

            if (!email) {
                return res.status(400).send({ error: 'User email is required to vote' });
            }

            try {
                // Find the post
                const post = await postCollection.findOne({ _id: new ObjectId(id) });

                if (!post) {
                    return res.status(404).send({ error: 'Post not found' });
                }

                // Check if the email already exists in the votedBy array
                if (post.votedBy?.includes(email)) {
                    return res.status(403).send({ error: 'You have already voted on this post' });
                }

                // Add the email to the votedBy array and increment the downVote count
                const result = await postCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $inc: { downVote: 1 },
                        $push: { votedBy: email },
                    }
                );

                res.send(result);
            } catch (error) {
                console.error('Error updating downvote:', error);
                res.status(500).send({ error: 'Failed to downvote post' });
            }
        });


        //user related APIs
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result);

        })

        app.get('/user/admin/:email', verifyToken, async(req, res)=>{
            const email = req.params.email;
            if(email !== req.decode.email){
                return res.status(403).send({message: 'Forbidden Access'})
            }
            const query = {email : email};
            const user = await userCollection.findOne(query);
            let admin = false;
            if(user){
                admin = user.role === 'admin'
            }

            res.send({admin})
        })

        app.post('/users', async (req, res) => {
            const userInfo = req.body;
            const query = { email: userInfo.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                console.log(existingUser);
                return res.send({ message: 'user already exits', insertedId: null })
            }
            else {
                const result = await userCollection.insertOne(userInfo);
                res.send(result);
            }
        })

        app.patch('/user/admin/:id', verifyToken, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const filter = {_id : new ObjectId(id)};
            const updateDoc  = {
                $set : {
                    role : 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.find(query).toArray();
            res.send(result)
        })


        //Payment Intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });

            console.log(amount);

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
        // Payment Data
        app.post('/payment', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);

            res.send(result)
        })

        app.get('/payment/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            try {
                const result = await paymentCollection.find(query).toArray();
                const updateResult = await userCollection.updateOne(
                    { email },
                    { $set: { userBadge: 'Gold' } },
                    { upsert: true }
                );

                res.send({
                    payments: result,
                    badgeUpdate: updateResult
                });
            } catch (error) {
                console.error('Error in /payment/:email:', error);
                res.status(500).send({ error: 'Internal server error' });
            }
        });




        // MongoDB connection check
        await client.db("admin").command({ ping: 1 });
        console.log("Connected to MongoDB successfully!");
    } finally {
        // Ensures the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

// Base route
app.get('/', (req, res) => {
    res.send('TagTalk is Talking');
});

// Server
app.listen(port, () => {
    console.log(`TagTalk server running on port: ${port}`);
});
