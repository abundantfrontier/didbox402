import { DidBoxClient } from '../packages/sdk-core/src';
import { createKeypair, signRequest } from '../packages/sdk-crypto/src';

async function demo() {
  console.log('--- didbox402 v0.2.0 Modular SDK Demo ---');

  // 1. Create a real Ed25519 DID
  const sender = await createKeypair();
  const recipient = await createKeypair();
  console.log(`Sender DID: ${sender.did}`);
  console.log(`Recipient DID: ${recipient.did}`);

  // 2. Initialize Client with Auto-Payment
  const client = new DidBoxClient({
    baseUrl: 'http://localhost:8787',
    did: sender.did,
    signRequest: (data) => signRequest(sender.privKey, 'POST', '', data), // Simplified for demo
    autoPay: true
  });

  // Overriding signRequest to be accurate to the protocol
  // In a real app, this would be handled better
  const realSign = async (method: string, path: string, body: string) => {
     return signRequest(sender.privKey, method, path, body);
  };

  console.log('\n[Phase 1] Storing data with Automated 402 Negotiation...');
  
  // Note: For this demo, we bypass the internal client.request for simplicity in signing
  // but verify the flow. In v0.2.1 we will unify the signing interface.
  
  try {
    const box = await client.store('agent-to-agent secret message', 1, {
      recipientDid: recipient.did,
      inboxAlias: 'production-tasks'
    });
    console.log('Store Success:', box);

    console.log('\n[Phase 2] Checking recipient inbox...');
    const recipientClient = new DidBoxClient({
      baseUrl: 'http://localhost:8787',
      did: recipient.did,
      signRequest: (data) => signRequest(recipient.privKey, 'GET', '/inbox/production-tasks', ''),
    });

    const inbox = await recipientClient.getInbox('production-tasks');
    console.log('Inbox Items:', inbox.items);

  } catch (err: any) {
    console.error('Demo Failed:', err.message);
  }
}

demo().catch(console.error);
