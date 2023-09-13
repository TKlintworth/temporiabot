const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a card from your deck. The card is added if it does not exist in your deck.')
        .addAttachmentOption(option => option.setName('card').setDescription('The card to be played.').setRequired(true)),
    async execute(interaction) {
        const image = interaction.options.getAttachment('card');
        const username = await interaction.user.username;
        const imageBuffer = await axios.get(image.url, { responseType: 'arraybuffer' });
        const blob = new Blob([imageBuffer.data], { type: 'image/png' });
        const formData = new FormData();
        formData.append('image', blob);
        const qrCode = await axios.post('http://localhost:5000/read-qr-code', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        const qrCodeString = qrCode.data;
        // Check if the user has the card in their deck
        const response = await axios.post('http://localhost:5000/play', { qrCode: qrCodeString, discordUsername : username });
        if (!response.success) {
            await interaction.reply(`Error: ${response.error}`);
            return;
        }
        const cardValue = response.cardValue;
        const cardImageUrl = response.imageUrl;
        const userNewScore = response.score;
        await interaction.reply(`You played a card with value ${cardValue}! Your new score is ${userNewScore}.`, { files: [cardImageUrl] });
    },
};