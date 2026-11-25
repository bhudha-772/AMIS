const fs = require('fs');

// Wait a moment for server to fully initialize
setTimeout(() => {
  console.log("Checking server output...");
  
  // Read the server output log
  try {
    const logContent = fs.readFileSync('server_output.log', 'utf8');
    console.log("=== SERVER LOG ANALYSIS ===");
    
    // Look for Moonshot AI related messages
    const lines = logContent.split('\n');
    const moonshotErrors = lines.filter(line => line.includes('MoonshotAI'));
    const scanMessages = lines.filter(line => line.includes('[SCAN'));
    
    console.log(`Found ${moonshotErrors.length} MoonshotAI error messages:`);
    moonshotErrors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
    
    console.log(`\nFound ${scanMessages.length} scan messages:`);
    scanMessages.slice(-10).forEach((msg, index) => {  // Show last 10
      console.log(`${index + 1}. ${msg}`);
    });
    
    // Check for successful responses
    const successIndicators = lines.filter(line => 
      line.includes('recommendedSymbol') || 
      line.includes('WAIT') || 
      line.includes('NO VALID SETUP')
    );
    
    if (successIndicators.length > 0) {
      console.log("\n✅ SUCCESS INDICATORS FOUND:");
      successIndicators.slice(-5).forEach(indicator => {
        console.log(`  ${indicator}`);
      });
    } else {
      console.log("\n⚠️  No success indicators found yet");
    }
    
  } catch (error) {
    console.log("Could not read server log:", error.message);
  }
  
}, 3000);