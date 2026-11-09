const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initiateCall } = require('../src/utils/exotel');

const args = process.argv.slice(2);
const from = args[0];
const to = args[1];

if (!from || !to) {
  console.log('====================================================');
  console.log('Exotel Click-to-Call Test Runner');
  console.log('====================================================');
  console.log('Usage:');
  console.log('  node scripts/make-test-call.js <FROM_PHONE> <TO_PHONE>');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/make-test-call.js 9876543210 9123456789');
  console.log('');
  console.log('Note:');
  console.log('  1. The <FROM_PHONE> (e.g. your phone) will ring FIRST.');
  console.log('  2. Once answered, Exotel will dial <TO_PHONE> and bridge you.');
  console.log('  3. In Trial accounts, numbers must be verified in Exotel dashboard.');
  console.log('====================================================');
  process.exit(1);
}

async function run() {
  console.log(`\nInitiating test call...`);
  console.log(`Caller (First Ring): ${from}`);
  console.log(`Destination (Second Ring): ${to}`);

  try {
    const result = await initiateCall({
      from,
      to,
      record: true
    });

    console.log('\n Call successfully initiated!');
    console.log('-------------------------------------------');
    console.log('Call SID:       ', result.callSid);
    console.log('Status:         ', result.status);
    console.log('ExoPhone Used:  ', result.callerId);
    console.log('Date Created:   ', result.dateCreated);
    console.log('-------------------------------------------');
    console.log('Pick up your phone when it rings to connect to the second number.\n');
  } catch (err) {
    console.error('\n Call initiation failed:');
    console.error(err.message);
    if (err.details) {
      console.error('Details:', JSON.stringify(err.details, null, 2));
    }
  }
}

run();

