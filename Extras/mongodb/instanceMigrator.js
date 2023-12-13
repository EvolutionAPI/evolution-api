// install the mongodb dependency before running this script
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// Database connection
const uri = "mongodb://localhost:27017"; // Replace with your MongoDB URI
const client = new MongoClient(uri);

async function migrate(instanceName) {
  try {
    await client.connect();

    const database = client.db("evolution-instances");
    const collection = database.collection(instanceName);

    // Directory where JSON files are stored
    const directoryPath = `./instances/${instanceName}`;

    // Reading the creds JSON file
    const instanceFile = path.join(directoryPath, "creds.json")
    const instance = JSON.parse(fs.readFileSync(`${instanceFile}`, "utf-8"));
    // defining the document's _id
    instance._id = "creds";
    // Inserting data into MongoDB
    const result = await collection.insertOne(instance);
    console.log(`Document saved with _id: ${result.insertedId}`);

    // Reading file names in the directory
    const files = fs.readdirSync(directoryPath).filter(file => file.startsWith("pre-key"));

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      let instance = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      try {
        // Inserting data into MongoDB
        const result = await collection.insertOne(instance);
        console.log(`Document inserted with _id: ${result.insertedId}`);
      } catch (error) {
        // Check if the error is due to a duplicate ID
        if (error.code === 11000) {
            console.log(`Ignoring insertion due to duplicate ID: ${instance._id}`);
        } else {
            // If the error is for another reason, it will be thrown again
            throw error;
        }
      }
    }
  } finally {
      // Closing the database connection
      await client.close();
  }
}

const instanceName = "my-instance"
migrate(instanceName).catch(console.dir);
