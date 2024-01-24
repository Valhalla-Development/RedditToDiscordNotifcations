import { MessageBuilder, Webhook } from 'minimal-discord-webhook-node';
import RssFeedEmitter from 'rss-feed-emitter';
import 'dotenv/config';

/**
 * Checks if the required environment variables are defined.
 * Throws an error with a list of missing variables if any are not set.
 * @function checkRequiredEnvVars
 * @throws An error if any of the required environment variables are missing.
 */
function checkRequiredEnvVars(): void {
    // Array of required environment variable names
    const requiredVars = [
        'WebhookUrl',
        'WebhookUsername',
        'WebhookAvatar',
        'EmbedAuthorImageUrl',
        'RssUrl',
        'RssName',
    ];

    // Filtering out the missing environment variables
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    // If any required variables are missing, throw an error
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
}

try {
    checkRequiredEnvVars();
} catch (error) {
    console.error(error);
    process.exit(1);
}

const hook = new Webhook(process.env.WebhookUrl as string);
hook.setUsername(process.env.WebhookUsername as string);
hook.setAvatar(process.env.WebhookAvatar as string);

/**
 * Sets up and monitors an RSS feed using the RssFeedEmitter library.
 * @async
 * @function setupFeed
 * @returns A promise that resolves when the feed is successfully set up.
 */
async function setupFeed(): Promise<void> {
    const feeder = new RssFeedEmitter({ skipFirstLoad: true });
    try {
        // Adding the RSS feed configuration to the feeder
        feeder.add({
            url: process.env.RssUrl as string,
            refresh: 60000,
            eventName: process.env.RssName as string,
        });

        // Event listener for the 'AirReps' event triggered by the feeder
        feeder.on('AirReps', async (res) => {
            await processWebhook(res);
        });

        console.log('RSS feed monitoring started...');
    } catch (error) {
        // Handling setup errors and retrying after a delay
        console.error('Error setting up RSS feed:', error);
        console.log('Retrying in 10 seconds...');
        setTimeout(setupFeed, 10 * 1000);
    }
}

await setupFeed();

/**
 * Processes the webhook response and sends a Discord webhook with the extracted information.
 * @async
 * @function processWebhook
 * @param res - The webhook response containing information to be processed.
 * @returns A promise that resolves when the webhook processing is complete.
 */
async function processWebhook(res: {
    description: string;
    title: string;
    link: string;
    author: string;
    image: {
        url?: string
    }
    guid: string
}): Promise<void> {
    // Extracting text from the description field
    const extractedText = extractTextFromDescription(res);

    if (!extractedText) return;

    // Building a Discord message embed
    const embed = new MessageBuilder()
        .setTitle(res.title)
        // @ts-expect-error: The creator of the package incorrectly defined this as setUrl instead of setURL in its type file
        .setURL(res.link)
        .setColor('#FF4500')
        .setDescription(extractedText)
        .setFooter(`${res.author} | ${returnFormattedDate()}`, process.env.EmbedAuthorImageUrl as string);

    try {
        // Sending the embed to the Discord webhook
        await hook.send(embed);
    } catch (error) {
        // Handling errors that may occur while sending the webhook
        console.error('Error sending Discord webhook:', error);
    }
}

/**
 * Extracts text content or image links from HTML description.
 *
 * This function uses regular expressions to match text content or image links within an HTML structure.
 * If text content is found, it is extracted, HTML tags are removed, and paragraphs are formatted with newlines.
 * If no text content is found, it checks for image links and returns them.
 *
 * @param res - The JSON response from the RSS feed.
 * @returns Extracted text content or image links, formatted accordingly.
 */
function extractTextFromDescription(res: {
    description: string;
    title: string;
    link: string;
    author: string;
    image: {
        url?: string
    }
    guid: string
}): string {
    // Regular expression to match the entire div and its content
    const mdRegex = /<div class="md">([\s\S]*?)<\/div>/;

    // Attempt to find a match for text content
    const mdMatch = res.description.match(mdRegex);

    if (mdMatch) {
        // If there is a match for text content, extract text, remove HTML tags, and handle paragraphs
        return mdMatch[1]
            .replace(/<p>/g, '\n\n') // Replace paragraph tags with newlines
            .replace(/<[^>]*>/g, '') // Remove all remaining HTML tags
            .replace(/&#39;/g, '\'') // Replace HTML entity apostrophes
            .trim();
    }

    // If no match for text content, check for images
    if (Object.keys(res.image).length > 0) {
        return `[**Image**](https://www.reddit.com/gallery/${res.guid.replace(/^t\d_/, '')})`;
    }

    // If no text or images
    return '';
}

/**
 * Returns the current date and time formatted as a string.
 * @function returnFormattedDate
 * @returns The formatted date string.
 */
function returnFormattedDate(): string {
    // Getting the current date and time
    const today = new Date();

    // Formatting the date string using the 'toLocaleString' method
    return today.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}
