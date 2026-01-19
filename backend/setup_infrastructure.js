const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOML_PATH = path.join(__dirname, 'wrangler.toml');

function runCommand(command) {
    try {
        console.log(`Running: ${command}`);
        return execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
        console.error(`Command failed: ${command}`);
        console.error(error.message);
        console.error(error.stdout);
        console.error(error.stderr);
        throw error;
    }
}

function main() {
    console.log("🚀 Starting Cloudflare Infrastructure Setup...");

    // 1. Create D1 Database
    console.log("\n📦 Creating D1 Database 'autobiography-db'...");
    let dbId = "";
    try {
        // Try creating without --json first as some versions choke on it for 'create', 
        // but 'list' usually supports it.
        const d1Output = runCommand("npx wrangler d1 create autobiography-db");
        // Output look like: "✅ Created DB 'autobiography-db' with ID <uuid>"
        const match = d1Output.match(/ID\s+([a-f0-9-]+)/i);
        if (match && match[1]) {
            dbId = match[1];
        } else {
            console.log("   Could not parse ID from create output. Checking list...");
            throw new Error("Parse failed");
        }
    } catch (e) {
        // If it fails, maybe it already exists?
        try {
            console.log("   Checking if it already exists...");
            const listOutput = runCommand("npx wrangler d1 list --json");
            // Parse logic slightly different depending on wrangler version
            const list = JSON.parse(listOutput);
            // Wrangler v3 list output is usually an array
            const validList = Array.isArray(list) ? list : (list.result || []);
            const existing = validList.find(db => db.name === 'autobiography-db');
            if (existing) {
                dbId = existing.uuid;
                console.log(`   Detailed: Found existing DB ${dbId}`);
            } else {
                throw e;
            }
        } catch (ex) {
            console.error("❌ Failed to create or find D1 database. Ensure you are logged in with 'npx wrangler login'.");
            console.error(ex);
            process.exit(1);
        }
    }
    console.log(`✅ Database ID: ${dbId}`);

    // 2. Create R2 Bucket
    console.log("\n🪣 Creating R2 Bucket 'autobiography-files'...");
    try {
        runCommand("npx wrangler r2 bucket create autobiography-files");
        console.log("✅ Bucket created (or already exists).");
    } catch (e) {
        if (e.stdout && e.stdout.includes("already exists")) {
            console.log("✅ Bucket already exists.");
        } else {
            console.warn("⚠️ Warning: Could not create bucket. It might simply exist or permissions are missing.");
        }
    }

    // 3. Update wrangler.toml
    console.log("\n📝 Updating wrangler.toml...");
    let tomlContent = fs.readFileSync(TOML_PATH, 'utf-8');

    // Replace placeholder or existing ID
    // Regex matches: database_id = "..."
    const newTomlContent = tomlContent.replace(
        /database_id = ".*?"/,
        `database_id = "${dbId}"`
    );

    fs.writeFileSync(TOML_PATH, newTomlContent);
    console.log("✅ wrangler.toml updated.");

    // 4. Apply Schema
    console.log("\n📜 Applying Database Schema...");
    try {
        runCommand(`npx wrangler d1 execute autobiography-db --local --file=src/schema.sql`);
        console.log("✅ Schema applied locally.");

        // Ask to apply remotely? For dev 'npm run dev' uses local by default usually, 
        // but let's apply to remote too so it's ready.
        console.log("   Applying schema to remote (this might fail if not fully propagated, which is fine for local dev)...");
        try {
            runCommand(`npx wrangler d1 execute autobiography-db --remote --file=src/schema.sql`);
            console.log("✅ Remote schema applied.");
        } catch (remErr) {
            console.warn("⚠️ Could not apply remote schema. You might need to do this later: npx wrangler d1 execute autobiography-db --remote --file=src/schema.sql");
        }

    } catch (e) {
        console.error("❌ Failed to apply schema.");
    }

    console.log("\n🎉 Setup Complete! You can now run 'npm run dev'.");
}

main();
