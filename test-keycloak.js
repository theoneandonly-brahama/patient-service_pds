const axios = require('axios');

// Test script to verify Keycloak configuration
// This helps diagnose connection and configuration issues

const KEYCLOAK_URL = process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'healthcare';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'patient-service';

console.log('🔍 Keycloak Configuration Test\n');
console.log('Configuration:');
console.log(`  Keycloak URL: ${KEYCLOAK_URL}`);
console.log(`  Realm: ${REALM}`);
console.log(`  Client ID: ${CLIENT_ID}\n`);

// Test 1: Check if Keycloak is reachable
async function testKeycloakConnection() {
  console.log('Test 1: Checking Keycloak connection...');
  
  try {
    // Try modern URL format first (Keycloak 17+)
    let response = await axios.get(`${KEYCLOAK_URL}/realms/${REALM}`);
    console.log('✅ Connected to Keycloak (Modern format - no /auth)');
    console.log(`   Realm: ${response.data.realm}`);
    return 'modern';
  } catch (error) {
    // Try legacy URL format (Keycloak 16 and older)
    try {
      const legacyUrl = KEYCLOAK_URL.replace('/auth', '') + '/auth';
      let response = await axios.get(`${legacyUrl}/realms/${REALM}`);
      console.log('✅ Connected to Keycloak (Legacy format - with /auth)');
      console.log(`   Realm: ${response.data.realm}`);
      console.log('⚠️  Update your .env: KEYCLOAK_AUTH_SERVER_URL=' + legacyUrl);
      return 'legacy';
    } catch (legacyError) {
      console.log('❌ Cannot connect to Keycloak');
      console.log(`   Error: ${error.message}`);
      console.log('\nTroubleshooting:');
      console.log('   1. Is Keycloak running? Check: docker ps');
      console.log('   2. Is it on port 8080? Check: docker ps | grep keycloak');
      console.log('   3. Is the realm "healthcare" created?');
      return null;
    }
  }
}

// Test 2: Try to get token with password grant (requires Direct Access Grants enabled)
async function testPasswordGrant(urlFormat) {
  console.log('\nTest 2: Testing Direct Access Grants (Password Grant)...');
  
  const baseUrl = urlFormat === 'legacy' 
    ? KEYCLOAK_URL.replace('/auth', '') + '/auth'
    : KEYCLOAK_URL;
  
  const tokenUrl = `${baseUrl}/realms/${REALM}/protocol/openid-connect/token`;
  
  console.log(`   Token URL: ${tokenUrl}`);
  console.log('   Attempting to get token...');
  console.log('   (This will fail if you haven\'t created a test user yet)\n');
  
  try {
    const response = await axios.post(tokenUrl, new URLSearchParams({
      client_id: CLIENT_ID,
      username: 'testuser',
      password: 'test123',
      grant_type: 'password'
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    console.log('✅ Successfully obtained token!');
    console.log(`   Token type: ${response.data.token_type}`);
    console.log(`   Expires in: ${response.data.expires_in} seconds`);
    console.log(`   Token preview: ${response.data.access_token.substring(0, 50)}...`);
    
    return response.data.access_token;
  } catch (error) {
    if (error.response) {
      console.log('❌ Token request failed');
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error: ${error.response.data.error}`);
      console.log(`   Description: ${error.response.data.error_description}`);
      
      if (error.response.data.error === 'invalid_grant') {
        console.log('\n📝 Action needed: Create a test user in Keycloak:');
        console.log('   1. Go to Keycloak admin console');
        console.log('   2. Select "healthcare" realm');
        console.log('   3. Go to Users → Add User');
        console.log('   4. Username: testuser');
        console.log('   5. Save, then go to Credentials tab');
        console.log('   6. Set password: test123');
        console.log('   7. Turn OFF "Temporary"');
      } else if (error.response.data.error === 'unauthorized_client') {
        console.log('\n📝 Action needed: Enable Direct Access Grants');
        console.log('   1. Go to Keycloak admin console');
        console.log('   2. Clients → patient-service');
        console.log('   3. Enable "Direct Access Grants" (or "Direct access grants enabled")');
        console.log('   4. Save');
      }
    } else {
      console.log('❌ Request failed:', error.message);
    }
    return null;
  }
}

// Test 3: Validate token
async function testTokenValidation(token, urlFormat) {
  if (!token) {
    console.log('\nTest 3: Skipped (no token available)');
    return;
  }
  
  console.log('\nTest 3: Testing token validation...');
  
  const baseUrl = urlFormat === 'legacy' 
    ? KEYCLOAK_URL.replace('/auth', '') + '/auth'
    : KEYCLOAK_URL;
  
  const userInfoUrl = `${baseUrl}/realms/${REALM}/protocol/openid-connect/userinfo`;
  
  try {
    const response = await axios.get(userInfoUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('✅ Token is valid!');
    console.log(`   User: ${response.data.preferred_username}`);
    console.log(`   Email: ${response.data.email || 'not set'}`);
  } catch (error) {
    console.log('❌ Token validation failed');
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
    }
  }
}

// Run all tests
async function runTests() {
  const urlFormat = await testKeycloakConnection();
  if (!urlFormat) {
    console.log('\n❌ Cannot proceed - Keycloak is not reachable');
    return;
  }
  
  const token = await testPasswordGrant(urlFormat);
  await testTokenValidation(token, urlFormat);
  
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  
  if (urlFormat && token) {
    console.log('✅ All tests passed! Your Keycloak is configured correctly.');
    console.log('\nYou can now start your patient service and test the full workflow.');
  } else if (urlFormat && !token) {
    console.log('⚠️  Keycloak is reachable but token retrieval failed.');
    console.log('   Follow the action items above to fix the configuration.');
  } else {
    console.log('❌ Keycloak connection failed.');
    console.log('   Make sure Keycloak is running and the URL is correct.');
  }
  
  console.log('\nNext step: Start patient service with: npm start');
}

runTests().catch(console.error);