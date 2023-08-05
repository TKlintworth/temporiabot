const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sharp = require('sharp');
const multer = require('multer');
const QRCode = require('qrcode');
const AWS = require('aws-sdk');


const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

mongoose.connect('mongodb+srv://temporia:cxK1GdgibGXy3zJp@cluster0.duwqbir.mongodb.net/?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true })
	.then(() => console.log('Connected to MongoDB'))
	.catch(err => console.error('Failed to connect to MongoDB', err));

const app = express();

const allowedOrigins = ['http://localhost:5000', 'http://temporia.s3-website-us-east-1.amazonaws.com/', 'http://localhost:5173'];
app.use(cors({
	origin: function(origin, callback) {
		if (!origin) return callback(null, true);
		if (allowedOrigins.indexOf(origin) === -1) {
			const msg = 'The CORS policy for this site does not ' +
						'allow access from the specified Origin.';
			return callback(new Error(msg), false);
		}
		return callback(null, true);
	},
}));
app.use(express.json());

const upload = multer({ dest: 'uploads/', storage: multer.memoryStorage() });

const cardSchema = new mongoose.Schema({
	name: String,
	image: String,
	frequency: String,
	description: String,
	value: Number,
	season: Number,
	cardId: {
		type: Number,
		unique: true,
	},
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false,
	},
});

const userSchema = new mongoose.Schema({
	id: Number,
	discordUsername: {
		type: String,
		required: true,
		unique: true,
	},
	cards: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Card',
		},
	],
});

const Card = mongoose.model('Card', cardSchema);
const User = mongoose.model('User', userSchema);


// GET endpoint to fetch all cards
app.get('/cards', async (req, res) => {
	const cards = await Card.find();
	res.send(cards);
});

// POST endpoint to create a new card
app.post('/cards', async (req, res) => {
	const card = new Card(req.body);
	await card.save();
	res.send(card);
});

app.get('/users', async (req, res) => {
	const users = await User.find();
	res.send(users);
});

app.post('/create-card', upload.single('image'), async (req, res) => {
	console.warn('"req.body"', req.body);
	console.log(req.file);
	const imageBuffer = req.file.buffer;
	console.warn('imageBuffer', imageBuffer);
	const qrCodeString = `${req.body.season}_${req.body.name}`;
	const qrCodeImageBuffer = await QRCode.toBuffer(qrCodeString);
	console.warn('qrCodeImageBuffer', qrCodeImageBuffer);

	try {
		const compositeImageBuffer = await sharp(imageBuffer)
			.composite([{ input: qrCodeImageBuffer, gravity: 'southeast' }])
			.toBuffer();
		// Upload the image data to S3
		const uploadParams = {
			Bucket: 'temporiaimages',
			Key: `card_${req.body.name}.png`,
			Body: compositeImageBuffer,
		};
		const uploadResult = await s3.upload(uploadParams).promise();
		console.log('uploadResult', uploadResult);
		// Save the card to the database
		const card = new Card({
			name: req.body.name,
			image: uploadResult.Location,
			frequency: req.body.frequency,
			description: req.body.description,
			value: req.body.value,
			season: req.body.season,
			cardId: req.body.cardId,
		});
		await card.save();
		res.send(card);
	} catch (error) {
		console.error(error);
	}
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
