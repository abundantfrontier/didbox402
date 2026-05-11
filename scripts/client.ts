const BASE_URL = 'http://localhost:8787';
const MY_DID = 'did:key:z6MkpTHR8VNs2H68cH7MbcN6n4v49uGHx2bC98B6Jm';
const RECIPIENT_DID = 'did:key:z6Mkf869mT8VNs2H68cH7MbcN6n4v49uGHx2bC98B6Jm';

async function demo() {
  console.log('--- DIDBox402 Client Demo ---');

  // 1. Store a payload
  console.log('\n1. Storing data...');
  const storeResponse = await fetch(`${BASE_URL}/store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DID': MY_DID,
      'X-DID-Signature': 'mock_signature', // In reality, a cryptographic signature
      'X-Payment': 'mock_payment_preimage'
    },
    body: JSON.stringify({
      ciphertext: 'encrypted_content_here',
      durationHours: 1,
      recipientDid: RECIPIENT_DID
    })
  });
  const box = await storeResponse.json();
  console.log('Box Created:', box);

  // 2. Check Inbox (as the recipient)
  console.log('\n2. Checking recipient inbox...');
  const inboxResponse = await fetch(`${BASE_URL}/inbox`, {
    headers: {
      'X-DID': RECIPIENT_DID,
      'X-DID-Signature': 'mock_signature'
    }
  });
  const inbox = await inboxResponse.json();
  console.log('Inbox Items:', inbox.items);

  // 3. Retrieve the box (as the recipient)
  if (inbox.items.length > 0) {
    const boxId = inbox.items[0].id;
    console.log(`\n3. Retrieving box ${boxId}...`);
    const retrieveResponse = await fetch(`${BASE_URL}/retrieve/${boxId}`, {
      headers: {
        'X-DID': RECIPIENT_DID,
        'X-DID-Signature': 'mock_signature'
      }
    });
    const retrieved = await retrieveResponse.json();
    console.log('Retrieved Ciphertext:', retrieved.ciphertext);

    // 4. Extend the box (as the owner)
    console.log(`\n4. Extending box ${boxId} by 2 hours...`);
    const extendResponse = await fetch(`${BASE_URL}/extend/${boxId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_signature',
        'X-Payment': 'mock_payment_preimage'
      },
      body: JSON.stringify({
        additionalHours: 2
      })
    });
    const extended = await extendResponse.json();
    console.log('Extension Result:', extended);
  }
}

demo().catch(console.error);
