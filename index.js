const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');

console.log('Starting WhatsApp client initialization...');

const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Configuration constants
const BATCH_SIZE = 15; // Number of people to add before waiting
const BATCH_DELAY = 30000; // Delay between batches (30 seconds)
const MESSAGE_DELAY = 2000; // Delay between individual messages (2 seconds)

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to process participants in batches
async function processBatch(participants, processFn) {
    const results = [];
    
    for (let i = 0; i < participants.length; i++) {
        try {
            // Process individual participant
            const result = await processFn(participants[i]);
            results.push(result);
            
            // Add delay between individual operations
            await delay(MESSAGE_DELAY);
            
            // If we've hit our batch size, wait before continuing
            if ((i + 1) % BATCH_SIZE === 0 && i + 1 < participants.length) {
                console.log(`Processed ${i + 1} participants. Waiting ${BATCH_DELAY/1000} seconds before continuing...`);
                await delay(BATCH_DELAY);
            }
        } catch (error) {
            console.error(`Error processing participant ${participants[i]}:`, error);
            results.push(null);
        }
    }
    
    return results;
}

client.on('ready', async () => {
    console.log('Client is ready!');
    
    try {
        const participants = [
            '919110589501@c.us',
            '919110521173@c.us',
            '917013848045@c.us'
            // Add more participants here
        ];

        const groupName = "Test Group";
        console.log(`Creating group "${groupName}" with ${participants.length} participants...`);
        
        // Create group with first participant to avoid errors
        const groupChat = await client.createGroup(groupName, [participants[0]]);
        const groupId = groupChat.gid._serialized;
        console.log('Group created successfully!');
        console.log('Group ID:', groupId);

        // Add remaining participants in batches
        const remainingParticipants = participants.slice(1);
        const chat = await client.getChatById(groupId);
        
        console.log('Adding remaining participants in batches...');
        const addResults = await processBatch(remainingParticipants, async (participant) => {
            try {
                await chat.addParticipants([participant]);
                console.log(`Successfully added ${participant}`);
                return { participant, success: true };
            } catch (error) {
                console.log(`Failed to add ${participant} directly`);
                return { participant, success: false };
            }
        });

        // Handle participants who couldn't be added directly
        const failedToAdd = addResults
            .filter(result => result && !result.success)
            .map(result => result.participant);

        if (failedToAdd.length > 0) {
            console.log('Generating invite link for participants who couldn\'t be added directly...');
            
            try {
                const inviteCode = await chat.getInviteCode();
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                // Send invite links in batches
                console.log('Sending invite links to participants...');
                await processBatch(failedToAdd, async (participant) => {
                    try {
                        await client.sendMessage(participant, 
                            `You're invited to join our group "${groupName}". Click the link below to join:\n\n${inviteLink}`
                        );
                        console.log(`Invite link sent to ${participant}`);
                        return { participant, success: true };
                    } catch (error) {
                        console.error(`Failed to send invite link to ${participant}`);
                        return { participant, success: false };
                    }
                });
            } catch (error) {
                console.error('Error generating or sending invite links:', error);
            }
        }

        // Send welcome message to the group
        await client.sendMessage(groupId, 'Welcome to the group!');
        
        // Print summary
        const addedDirectly = addResults.filter(result => result && result.success).length;
        console.log('\nSummary:');
        console.log(`- Total participants: ${participants.length}`);
        console.log(`- Added directly: ${addedDirectly}`);
        console.log(`- Required invites: ${failedToAdd.length}`);
        
    } catch (error) {
        console.error('Error in group creation process:', error);
    }
});

// Function to add participants to existing group with rate limiting
async function addParticipantsToGroup(groupId, participants) {
    try {
        const chat = await client.getChatById(groupId);
        
        console.log(`Adding ${participants.length} participants to existing group...`);
        const addResults = await processBatch(participants, async (participant) => {
            try {
                await chat.addParticipants([participant]);
                console.log(`Successfully added ${participant}`);
                return { participant, success: true };
            } catch (error) {
                console.log(`Failed to add ${participant} directly`);
                return { participant, success: false };
            }
        });

        const failedToAdd = addResults
            .filter(result => result && !result.success)
            .map(result => result.participant);

        if (failedToAdd.length > 0) {
            const inviteCode = await chat.getInviteCode();
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            await processBatch(failedToAdd, async (participant) => {
                try {
                    await client.sendMessage(participant, 
                        `You're invited to join our WhatsApp group. Click the link below to join:\n\n${inviteLink}`
                    );
                    console.log(`Invite link sent to ${participant}`);
                    return { participant, success: true };
                } catch (error) {
                    console.error(`Failed to send invite link to ${participant}`);
                    return { participant, success: false };
                }
            });
        }

        return {
            addedDirectly: participants.length - failedToAdd.length,
            sentInvites: failedToAdd.length
        };
    } catch (error) {
        console.error('Error in addParticipantsToGroup:', error);
        throw error;
    }
}

// Event handlers
client.on('qr', (qr) => {
    console.log('QR Code received:', new Date().toLocaleString());
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('Client is authenticated!');
});

client.on('auth_failure', (error) => {
    console.error('Authentication failed:', error);
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected:', reason);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Initializing client...');
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
});