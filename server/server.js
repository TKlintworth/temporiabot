const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sharp = require('sharp');
const multer = require('multer');
const QRCode = require('qrcode');
const AWS = require('aws-sdk');
// const jsQR = require('jsqr');
// const fs = require('fs');
const archiver = require('archiver');
// const add = require('../commands/gameplay/add');

const CURRENT_SEASON = 1;

const s3 = new AWS.S3({ apiVersion: '2006-03-01',
			accessKeyId: process.env.AWS_ACCESS_ID,
			secretAccessKey: process.env.AWS_SECRET_KEY });

mongoose.connect('', { useNewUrlParser: true, useUnifiedTopology: true })
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
	frequency: Object,
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

const seasonScoresSchema = new mongoose.Schema({
	season: Number,
	scores: [
		{
			user: {
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
			},
			score: Number,
		},
	],
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
            card: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Card',
            },
            lastPlayedTimestamp: {
                type: String,
            },
        },
    ],
});

const Card = mongoose.model('Card', cardSchema);
const User = mongoose.model('User', userSchema);
const SeasonScores = mongoose.model('SeasonScores', seasonScoresSchema, 'season_scores');

/* const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

app.post('/read-qr-code', upload.single('image'), async (req, res) => {
    Jimp.read(req.file.buffer, (err, image) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to process the image." });
        }

        const qr = new QrCode();
        qr.callback = (err, value) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Failed to read QR code with the first method. Trying another..." });
            }

            res.json({ data: value.result });
        };
        qr.decode(image.bitmap);
    });
}); */

// Endpoint to retrieve an image from a url and read the qr code
/* app.post('/read-qr-code', upload.single('image'), async (req, res) => {
	// console.log('req', req);
	try {
		const { data, info } = await sharp(req.file.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		await sharp(req.file.buffer)
				.resize({ width: 1000 })
				.removeAlpha()
				.toFile('processed_image.png');
		console.log("Buffer Data:", data.slice(0, 10));
		console.log("Image Info:", info);
		const clampedArray = new Uint8ClampedArray(data);
		console.log(clampedArray.length === 4 * info.width * info.height);
		const qrCode = await jsQR(clampedArray, info.width, info.height);
		console.log('qrCode:', qrCode);

		return;
		const imageBuffer = await sharp(req.file.buffer).ensureAlpha().raw().toBuffer();
		const dimensions = await sharp(req.file.buffer).metadata();
		const width = dimensions.width;
		const height = dimensions.height;
		// const clampedArray = new Uint8ClampedArray(imageBuffer);

		// const qrCode = await jsQR(clampedArray, width, height);
		console.log('qrCode:', qrCode);

		if (qrCode && qrCode.data) {
			// res.send(qrCode.data ? qrCode.data : 'QR code not found');
			res.json({ data: qrCode.data });
		} else {
			throw new Error({ error: 'Failed to read QR code from the image. Please try again and make sure the QR code is well lit and visible.' });
		}
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: error.message || "Failed to read QR code from the image. Please try again and make sure the QR code is well lit and visible." });
	}
}); */

// GET endpoint to fetch all cards
app.get('/cards', async (req, res) => {
	const cards = await Card.find();
	res.send(cards);
});

// A simple ping endpoint to test the server
app.get('/ping', (req, res) => {
	res.send('pong');
});

app.post('/add', async (req, res) => {
	const cardAdded = await addCard(req);
	await res.send(cardAdded);
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
			const resizedQrCodeImageBuffer = await sharp(qrCodeImageBuffer).resize(129, 113, { fit: 'fill' }).toBuffer();
			const compositeImageBuffer = await sharp(imageBuffer)
				.composite([{ input: resizedQrCodeImageBuffer, top: 1445, left: 1200 }])
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

app.post('/play', async (req, res) => {
	// Check user and card existence and ownership
	await addCard(req);

	let cardPlayable = false;
	// Now we can play the card
	const requestedCardQrCode = req.body.qrCode;
	const requestedUsername = req.body.discordUsername;
	const splitId = requestedCardQrCode.split('_');
	const season = parseInt(splitId[0]);
	const cardId = parseInt(splitId[1]);
	console.log('season:', season);
	console.log('cardId:', cardId);

	const currentUser = await User.findOne({ discordUsername : requestedUsername });
	console.log('currentUser:', currentUser);
	// Grab the dates that the card is allowed to be played
	const cardToPlay = await Card.findOne({ cardId : cardId, season: season });
	console.log('cardToPlay:', cardToPlay);
	const cardToPlayId = cardToPlay._id;
	const cardFrequency = cardToPlay.frequency;
	// Get the score value of the card
	const cardValue = cardToPlay.value;

	// Get the server date and time
	const date = new Date();
	const day = date.getDay();
	const monthDay = date.getDate();
	const month = date.getMonth() + 1;
	const year = date.getFullYear();

	// Format the date and time as MM/DD/YYYY, padding with 0s if necessary
	const formattedMonthDay = monthDay < 10 ? `0${monthDay}` : monthDay;
	const formattedMonth = month < 10 ? `0${month}` : month;
	const formattedDate = `${formattedMonth}/${formattedMonthDay}/${year}`;
	// const formattedDate = `${month}/${monthDay}/${year}`;
	// Get the lastPlayedTimestamp for the card

	// const lastPlayedTimestamp = currentUser.cardToPlayId.lastPlayedTimestamp;
	let lastPlayedTimestamp;
	currentUser.cards.forEach((card) => {
		console.log('card.card:', card.card);
		if (card.card.equals(cardToPlayId)) {
			lastPlayedTimestamp = card.lastPlayedTimestamp;
		}
	});

	// Check if the card is allowed to be played today (check the dates and also the lastPlayedTimestamp)
	if (cardFrequency.frequency === 'daily') {
		console.log('Inside daily check');
		console.log('formattedDate:', formattedDate);
		console.log('lastPlayedTimestamp:', lastPlayedTimestamp);
		console.log('lastPlayedTimestamp < formattedDate:', lastPlayedTimestamp < formattedDate);
		if (lastPlayedTimestamp < formattedDate) {
			console.log('Inside lastPlayedTimestamp check');
			cardPlayable = true;
		}
	} else if (cardFrequency.frequency === 'weekly') {
		const weekdays = cardFrequency.daysOfWeek;
		weekdays.forEach((specificDay) => {
			if (day === specificDay && lastPlayedTimestamp < formattedDate) {
				cardPlayable = true;
			}
		});
	} else if (cardFrequency.frequency === 'monthly') {
		const monthDays = cardFrequency.daysOfMonth;
		monthDays.forEach((specificDay) => {
			if (monthDay === specificDay && lastPlayedTimestamp < formattedDate) {
				cardPlayable = true;
			}
		});
	} else if (cardFrequency.frequency === 'yearly') {
		const specificDates = cardFrequency.specificDates;
		specificDates.forEach((specificDate) => {
			if (formattedDate === specificDate && lastPlayedTimestamp < formattedDate) {
				cardPlayable = true;
			}
		});
	}

	if (!cardPlayable) {
		console.log('Card is not playable');
		return res.send({ error: 'Card is not playable' });
	}

	// Check if there is a SeasonScores object for the current season overall
	// ie this is the first time someone is playing a card in the current season
	let currentSeasonScores = await SeasonScores.findOne({ season: CURRENT_SEASON });
	console.log('currentSeasonScores:', currentSeasonScores);
	if (!currentSeasonScores) {
		currentSeasonScores = new SeasonScores({
			season: CURRENT_SEASON,
			scores: [],
		});
		await currentSeasonScores.save();
	}

	// Check if they have a Score for the current season
	// ie this is the first time they are playing a card in the current season
	const userSeasonScore = await SeasonScores.findOne({ season: CURRENT_SEASON, 'scores.user': currentUser._id });
	let updatedScore;
	console.log('userSeasonScore:', userSeasonScore);

	if (!userSeasonScore) {
		const newScore = {
			user: currentUser._id,
			score: cardValue,
		};
		currentSeasonScores.scores.push(newScore);
		updatedScore = cardValue;
		await currentSeasonScores.save();
		// userSeasonScore = await SeasonScores.findOne({ season: CURRENT_SEASON, 'scores.user': currentUser._id });
		// console.log('userSeasonScore:', userSeasonScore);
	} else {
		// If they do have a Score for the current season, update it
		currentSeasonScores.scores.forEach((score) => {
			if (score.user.equals(currentUser._id)) {
				score.score += cardValue;
				updatedScore = score.score;
			}
		});
		await currentSeasonScores.save();
	}

	// Update the user's lastPlayedTimestamp for the card
	currentUser.cards.forEach((card) => {
		if (card.card.equals(cardToPlayId)) {
			card.lastPlayedTimestamp = formattedDate;
		}
	});
	await currentUser.save();

	// Return the score and the image url
	return res.send({ success: true, score: updatedScore, imageUrl: cardToPlay.image, cardValue: cardValue, cardName: cardToPlay.name });
	// return { success: 'Card played successfully', score: updatedScore, imageUrl: cardToPlay.image, cardValue: cardValue };
	// return ({ success: 'Card played successfully', score: updatedScore, imageUrl: cardToPlay.image, cardValue: cardValue });
});

/*
	Checks a couple things:
		* Does the card exist?
		* Does the user exist?
		* Does someone own the card?
*/
async function addCard(req) {
	const requestedId = req.body.qrCode;
	const requestedUsername = req.body.discordUsername;

	// Split requestedId into season and cardId by _ delimiter
	const splitId = requestedId.split('_');
	const season = parseInt(splitId[0]);
	const cardId = parseInt(splitId[1]);
	const existingCard = await Card.findOne({ cardId : cardId, season: season });
	// Check if the card exists
	if (!existingCard) {
		return ({ error: 'Card does not exist' });
	}

	// If the user is not in the user database/table, add them first
	await validateAndAddUser(requestedUsername);

	// If the card is in any players deck (including your own), you cannot add it to your deck
	const cardOwned = await User.findOne({ 'cards.card': existingCard._id });
	if (cardOwned) {
		return ({ error: 'This card is already owned' });
	}

	// Add the card to the user's deck
	await addCardToUserDeck(requestedUsername, existingCard);

	return ({ success: 'Card added to deck' });
}

async function validateAndAddUser(username) {
	const existingUsername = await User.findOne({ discordUsername : username });
	if (!existingUsername) {
		// Add the user to the database
		const user = new User({
			discordUsername: username,
			cards: [],
		});
		await user.save();
	}
}

async function addCardToUserDeck(username, card) {
	const user = await User.findOne({ discordUsername : username });
	// Get default timestamp
	user.cards.push({ card: card._id, lastPlayedTimestamp: "01/01/1970" });
	await user.save();
}

/* function formatDate(d) {
    const day = d.getDate();
    const month = d.getMonth() + 1; // JavaScript months are 0-based, so add 1
    const year = d.getFullYear();

    return `${month}/${day}/${year}`;
} */

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
