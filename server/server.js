const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sharp = require('sharp');
const multer = require('multer');
const QRCode = require('qrcode');
const AWS = require('aws-sdk');
const jsQR = require('jsqr');
const fs = require('fs');
const archiver = require('archiver');


const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

mongoose.connect('mongodb+srv://temporia:cxK1GdgibGXy3zJp@cluster0.duwqbir.mongodb.net/?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true })
	.then(() => console.log('Connected to MongoDB'))
	.catch(err => console.error('Failed to connect to MongoDB', err));

const app = express();

const allowedOrigins = ['http://localhost:5000', 'http://temporia.s3-website-us-east-1.amazonaws.com', 'http://localhost:5173'];
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

// Endpoint to retrieve an image from a url and read the qr code
app.post('/read-qr-code', upload.single('image'), async (req, res) => {
	// console.log('req', req);
	// console.log('req.file:', req.file);
	const imageBuffer = await sharp(req.file.buffer).raw().toBuffer();
	// Convert the image buffer to a Uint8ClampedArray
	const clampedArray = new Uint8ClampedArray(imageBuffer);
	// const imageBuffer = await sharp(req.body.image).toBuffer();
	const dimensions = await sharp(req.file.buffer).metadata();
	const width = dimensions.width;
	const height = dimensions.height;
	console.log('dimensions:', dimensions);
	const qrCode = await jsQR(clampedArray, width, height);
	res.send(qrCode ? qrCode.data : 'QR code not found');
});

// GET endpoint to fetch all cards
app.get('/cards', async (req, res) => {
	const cards = await Card.find();
	res.send(cards);
});

// A simple ping endpoint to test the server
app.get('/ping', (req, res) => {
	res.send('pong');
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

app.get('/get-card-id', async (req, res) => {
	// Find the highest cardId
	const highestCard = await Card.findOne().sort({ cardId: -1 });
	const highestCardId = highestCard ? highestCard.cardId : null;
	if (highestCardId === null) {
		res.send({ cardId: 0 });
		//return res.status(500).send({ error: 'No cards found' });
	} else {
		res.send({ cardId: highestCardId });
	}
});

app.post('/create-card', upload.single('image'), async (req, res) => {
	try {
		const quantity = parseInt(req.body.quantity);
		const imageBuffer = req.file.buffer;
		let uploadResult;
		const createdImages = [];

		for (let i = 0; i < quantity; i++) {
			const currentCardId = parseInt(req.body.cardId) + i;
			console.log('currentCardId:', currentCardId);
			const qrCodeString = `${req.body.season}_${currentCardId}`;
			console.log('qrCodeString:', qrCodeString);
			const existingCard = await Card.findOne({ cardId: currentCardId });
			if (existingCard) {
				return res.status(400).send({ error: 'Card already exists' });
			}

			// Generate the QR code
			const qrCodeImageBuffer = await QRCode.toBuffer(qrCodeString);
			const compositeImageBuffer = await sharp(imageBuffer)
				.composite([{ input: qrCodeImageBuffer, gravity: 'southeast' }])
				.toBuffer();
			createdImages.push(compositeImageBuffer);

			// Upload the image data to S3
			if (i === 0) {
				const uploadParams = {
					Bucket: 'temporiaimages',
					Key: `card_${req.body.name}_${currentCardId}.png`,
					Body: compositeImageBuffer,
				};
				uploadResult = await s3.upload(uploadParams).promise();
				console.log('uploadResult:', uploadResult);
			}

			const card = new Card({
				name: req.body.name,
				image: uploadResult.Location,
				frequency: req.body.frequency,
				description: req.body.description,
				value: req.body.value,
				season: req.body.season,
				cardId: parseInt(currentCardId),
			});

			await card.save();
		}
		res.app.set('images', createdImages);
		// res.send(card);
		res.send({ success: true, message: 'Card created successfully' });
	} catch (error) {
		console.error(error);
		res.status(500).send({ error: error.message });
	}
});

app.get('/download-images', async (req, res) => {
	const images = res.app.get('images');
	if (!images) {
		return res.status(500).send({ error: 'No images found' });
	}
	res.set('Content-Type', 'application/zip');
	res.set('Content-Disposition', 'attachment; filename=images.zip');
	const zip = archiver('zip');
	zip.pipe(res);
	images.forEach((image, index) => {
		zip.append(image, { name: `image_${index}.png` });
	});
	zip.finalize();
});


const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
