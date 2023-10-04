const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
// .addAttachmentOption(option => option.setName('card').setDescription('The card to be played.').setRequired(false)),

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a card from your deck. The card is added if it does not exist in your deck.')
        .addStringOption(option => option.setName('card_id').setDescription('The card to be played.').setRequired(true)),
    async execute(interaction) {
        // const image = interaction.options.getAttachment('card');
        const username = await interaction.user.username;
        // const imageBuffer = await axios.get(image.url, { responseType: 'arraybuffer' });
        // const blob = new Blob([imageBuffer.data], { type: 'image/png' });
        // const formData = new FormData();
        // formData.append('image', blob);
        await interaction.deferReply();
        // let qrCode;
        /* try {
            qrCode = await axios.post('http://localhost:5000/read-qr-code', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (error) {
            await interaction.editReply("Error: Couldn't read QR code.");
            return;
        }
        if (!qrCode.data) {
            await interaction.editReply('Error: No QR code detected.');
            return;
        }
        */
        // const qrCodeString = qrCode.data;
        const qrCodeString = interaction.options.getString('card_id');
        // Check if the user has the card in their deck
        let response = await axios.post('http://localhost:5000/play', { qrCode: qrCodeString, discordUsername : username });
        response = response.data;
        console.log(response);
        if (!response.success) {
            await interaction.editReply(`Error: ${response.error}`);
            return;
        }
        const userNewScore = response.score;
        const cardImageUrl = response.imageUrl;
        const cardValue = response.cardValue;
        const cardName = response.cardName;

        // inside a command, event listener, etc.
        const playedEmbed = new EmbedBuilder()
            .setColor('#7289da')
            .setTitle('Card Played!')
            .setDescription(`You played ${cardName}, giving you ${cardValue} points! Your new score is ${userNewScore}.`)
            .setImage(cardImageUrl)
            .setTimestamp();

        // channel.send({ embeds: [playedEmbed] });
		// await interaction.editReply('Pong!');
        await interaction.channel.send({ embeds: [playedEmbed] });
        await interaction.editReply('Card successfully played!');
        // await interaction.editReply(`You played a card with value ${cardValue}! Your new score is ${userNewScore}.`);
    },
};