const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add')
		.setDescription('Adds a card to the users deck.')
		.addAttachmentOption(option => option.setName('card').setDescription('The card to add to the deck.').setRequired(true)),
	async execute(interaction) {
		// interaction.user is the object representing the User who ran the command
		// interaction.member is the GuildMember object, which represents the user in the specific guild
		const image = interaction.options.getAttachment('card');
		const username = await interaction.user.username;

		// Get the image data from the url using axios
		const imageBuffer = await axios.get(image.url, { responseType: 'arraybuffer' });
		const blob = new Blob([imageBuffer.data], { type: 'image/png' });
		const formData = new FormData();
		formData.append('image', blob);

		// Send the imageBuffer to our /read-qr-code endpoint
		const qrCode = await axios.post('http://localhost:5000/read-qr-code', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
		// We have the QR code data, which is the unique id of the card
		const qrCodeString = qrCode.data;
		// Get the username of the user who ran the command
		// Check if the card exists in the card database/table
		// const cardExists = await axios.post('http://localhost:5000/add-card', { qrCode: qrCodeString, discordUsername : username });
		const cardExists = await axios.post('http://localhost:5000/add', { qrCode: qrCodeString, discordUsername : username });
		console.log('cardExists:', cardExists.data);
		if (cardExists.data.success) {
			await interaction.reply(`Card added to ${username}'s deck.`);
		} else {
			await interaction.reply(`Error: ${cardExists.data.error}`);
		}
	},
};