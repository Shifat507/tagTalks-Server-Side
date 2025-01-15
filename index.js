require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
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

    try {
        // Routes

        // Get all posts
        app.get('/post', async (req, res) => {
            const result = await postCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // Create a new post
        app.post('/post', async (req, res) => {
            const postData = req.body;
            postData.createdAt = new Date();
            postData.upVote = 0; // Initialize upVote
            postData.downVote = 0; // Initialize downVote
            const result = await postCollection.insertOne(postData);
            res.send(result);
        });

        // // Upvote a post
        // app.patch('/post/:id/upvote', async (req, res) => {
        //     const { id } = req.params;
        //     try {
        //         const result = await postCollection.updateOne(
        //             { _id: new ObjectId(id) },
        //             { $inc: { upVote: 1 } }
        //         );
        //         res.send(result);
        //     } catch (error) {
        //         console.error('Error updating upvote:', error);
        //         res.status(500).send({ error: 'Failed to upvote post' });
        //     }
        // });

        // // Downvote a post
        // app.patch('/post/:id/downvote', async (req, res) => {
        //     const { id } = req.params;
        //     try {
        //         const result = await postCollection.updateOne(
        //             { _id: new ObjectId(id) },
        //             { $inc: { downVote: 1 } }
        //         );
        //         res.send(result);
        //     } catch (error) {
        //         console.error('Error updating downvote:', error);
        //         res.status(500).send({ error: 'Failed to downvote post' });
        //     }
        // });


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
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);

        })
        app.post('/users', async (req, res) => {
            const userInfo = req.body;
            const result = await userCollection.insertOne(userInfo);
            res.send(result);
        })

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
