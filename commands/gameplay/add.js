const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add')
		.setDescription('Adds a card to the users deck.')
		.addAttachmentOption(option => option.setName('card').setDescription('The card to add to the deck.').setRequired(true)),
	async execute(interaction) {
		/*
		/add

		Private command

		Bot needs to take the message

		Make sure that there is an image

		Read the QR code to get the card identifier

		season_id

		**Search that the card exists in the DB**

		**Make sure that another user doesn’t have the same card**

		If so, add this card to the deck of the User that submitted the command

		If new user, create a new User
		*/
		// interaction.user is the object representing the User who ran the command
		// interaction.member is the GuildMember object, which represents the user in the specific guild
		const image = interaction.options.getAttachment('card');

		// Get the image data from the url using axios
		const imageBuffer = await axios.get(image.url, { responseType: 'arraybuffer' });
		const blob = new Blob([imageBuffer.data], { type: 'image/png' });
		const formData = new FormData();
		formData.append('image', blob);

		// Send the imageBuffer to our /read-qr-code endpoint
		const qrCode = await axios.post('http://localhost:5000/read-qr-code', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
		console.log('qrCode:', qrCode.data);
		await interaction.reply('Here is the data in the QR Code: ' + qrCode.data);
		// We have the QR code data, which is the unique id of the card
		// Check if the card exists in the card database/table
		// If it does exist, check if ANY user has this card
		// If the card exists, and NO user has it yet, add it to the user's deck
		// If the user is not in the user database/table, add them first

		// await interaction.reply('Hello');
		// console.warn(qrCode.data);
	},
};