const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
app.use(cors());
app.use(express.json());

let db;

// --- DATABASE INITIALIZATION ---
(async () => {
  // Opens a connection to a database stored in RAM
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

// 2. ENABLE FOREIGN KEY SUPPORT (Put it right here!)
  await db.get('PRAGMA foreign_keys = ON');
  console.log('Foreign key support enabled.');

  // 3. Create your tables
  await db.exec(`
    CREATE TABLE dog_profile (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        photo_url TEXT,
        sex TEXT CHECK(sex IN ('Male', 'Female', 'Unknown')),
        species TEXT,
        age_group TEXT, 
        sterilization_status TEXT,
        vaccination_bit_mask INTEGER DEFAULT 0, 
        status TEXT,
        is_missing BOOLEAN DEFAULT 0
    );

    CREATE TABLE vaccination_records (
        id TEXT PRIMARY KEY,
        dog_id TEXT NOT NULL,
        vaccine_type TEXT NOT NULL,    
        date_administered DATE NOT NULL,
        date_expires DATE,              
        provider_name TEXT,             
        batch_number TEXT,
        document_url TEXT,               
        FOREIGN KEY(dog_id) REFERENCES dog_profile(id) ON DELETE CASCADE
    );

    CREATE TABLE medical_treatments (
        id TEXT PRIMARY KEY,
        dog_id TEXT NOT NULL,
        treatment_type TEXT,            
        date TEXT,
        details TEXT,
        skin_condition TEXT,
        visible_injuries TEXT,
        signs_of_disease TEXT,
        FOREIGN KEY(dog_id) REFERENCES dog_profile(id)
    );


    CREATE TABLE activity_log (
        id TEXT PRIMARY KEY,
        dog_id TEXT NOT NULL,
        event_type TEXT,              
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        gps_location TEXT,
        status_observed TEXT,
        notes TEXT,
        contributor_id TEXT,         
        FOREIGN KEY(dog_id) REFERENCES dog_profile(id)
    );

    CREATE TABLE caretakers (
        id TEXT PRIMARY KEY,
        dog_id TEXT NOT NULL,
        name TEXT,
        contact_info TEXT,
        role TEXT,     
        FOREIGN KEY(dog_id) REFERENCES dog_profile(id)
    );
`);  


  console.log('In-memory SQLite database initialized.');
})();

// --- API 1: REGISTER DOG ---
app.post('/api/register', async (req, res) => {
  const { id,name,photo_url,sex,species,age_group ,sterilization_status ,vaccination_bit_mask ,status,is_missing  } = req.body;
  const dogId = id || `dog_${uuidv4().split('-')[0]}`;

  try {
    // await db.run(
    //   `INSERT INTO dogs (id, status, medicalBitfield, photo, caretakerId) VALUES (?, ?, ?, ?, ?)`,
    //   [dogId, status || 'Street', medicalBitfield || '00', photo || null, caretakerId || null]
    // );
    await db.run(
      `INSERT INTO dog_profile (id,name,photo_url,sex,species,age_group ,sterilization_status ,vaccination_bit_mask ,status,is_missing ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        dogId, 
        name,
        photo_url || null, 
        sex || 'Unknown',
        species || 'Unknown',
        age_group || 'Unknown',
        sterilization_status || 'Unknown',
        vaccination_bit_mask || '00', 
        status || 'Street',
        is_missing || '0'
      ]
    );

    res.status(201).json({ message: "Dog registered", id: dogId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- API 2: FETCH DOG PROFILE WITH ACTIVITY LOGGING ---
app.get('/api/dog/:id', async (req, res) => {
  const dogId = req.params.id;
  
  // 1. Get location and contributor info from the Query Parameters
  // Example: /api/dog/abc?lat=12.34&lon=56.78&contributor=user_99
  const { lat, lon, contributor } = req.query;
  const gpsLocation = (lat && lon) ? `${lat},${lon}` : 'Unknown';
  const contributorId = contributor || 'System';

  try {
    // 2. Fetch the dog profile
    const dog = await db.get('SELECT * FROM dog_profile WHERE id = ?', [dogId]);

    if (!dog) {
      return res.status(404).json({ error: "Dog not found" });
    }

    // 3. Log the activity using Server-side timestamp (CURRENT_TIMESTAMP)
    const logId = `log_${uuidv4().split('-')[0]}`;
    
    await db.run(
      `INSERT INTO activity_log (
        id, 
        dog_id, 
        event_type, 
        timestamp, 
        gps_location, 
        status_observed, 
        notes, 
        contributor_id
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
      [
        logId,
        dogId,
        'PROFILE_VIEW',        // The type of event
        gpsLocation,           // From phone's GPS
        'Sighted',            // Current status of the dog
        'Profile viewed via mobile app', 
        contributorId          // The ID of the person viewing
      ]
    );

    // Clean up boolean for JSON response
    dog.is_missing = !!dog.is_missing;

    res.json(dog);
  } catch (err) {
    console.error("Logging error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- API 3: LOG INTERACTION ---
app.post('/api/log-activity', async (req, res) => {
  const { 
    dog_id, 
    event_type, 
    lat, 
    lon, 
    status_observed, 
    notes, 
    contributor_id 
  } = req.body;

  // Validation: Ensure we know which dog this is for
  if (!dog_id) {
    return res.status(400).json({ error: "dog_id is required" });
  }

  const logId = `log_${uuidv4().split('-')[0]}`;
  const gpsLocation = (lat && lon) ? `${lat},${lon}` : 'Unknown';

  try {
    await db.run(
      `INSERT INTO activity_log (
        id, 
        dog_id, 
        event_type, 
        timestamp, 
        gps_location, 
        status_observed, 
        notes, 
        contributor_id
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
      [
        logId,
        dog_id,
        event_type || 'MANUAL_LOG',
        gpsLocation,
        status_observed || 'Unknown',
        notes || '',
        contributor_id || 'Anonymous'
      ]
    );

    res.status(201).json({ 
      message: "Activity logged successfully", 
      log_id: logId 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- API 3.2: GET LOG INTERACTION ---
app.get('/api/dog/:id/activities', async (req, res) => {
  const dogId = req.params.id;

  try {
    // Check if dog exists first (Optional but recommended)
    const dogExists = await db.get('SELECT id FROM dog_profile WHERE id = ?', [dogId]);
    if (!dogExists) {
      return res.status(404).json({ error: "Dog not found" });
    }

    // Fetch all logs, ordering by timestamp descending
    const activities = await db.all(
      `SELECT * FROM activity_log 
       WHERE dog_id = ? 
       ORDER BY timestamp DESC`,
      [dogId]
    );

    res.json({
      dog_id: dogId,
      total_logs: activities.length,
      activities: activities
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});






// -----------------CRUD APIS--------------------------
// --- API 4: LIST ALL DOGS ---
app.get('/api/dogs', async (req, res) => {
  try {
    const dogs = await db.all('SELECT * FROM dog_profile');
    // Convert sqlite 0/1 to boolean for the frontend
    const formattedDogs = dogs.map(dog => ({
      ...dog,
      is_missing: !!dog.is_missing
    }));
    res.json(formattedDogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 5: UPDATE DOG PROFILE (Update) ---
app.put('/api/dog/:id', async (req, res) => {
  const dogId = req.params.id;
  const { 
    name, photo_url, sex, species, age_group, 
    sterilization_status, vaccination_bit_mask, status, is_missing 
  } = req.body;

  try {
    const result = await db.run(
      `UPDATE dog_profile SET 
        name = COALESCE(?, name),
        photo_url = COALESCE(?, photo_url),
        sex = COALESCE(?, sex),
        species = COALESCE(?, species),
        age_group = COALESCE(?, age_group),
        sterilization_status = COALESCE(?, sterilization_status),
        vaccination_bit_mask = COALESCE(?, vaccination_bit_mask),
        status = COALESCE(?, status),
        is_missing = COALESCE(?, is_missing)
      WHERE id = ?`,
      [name, photo_url, sex, species, age_group, sterilization_status, vaccination_bit_mask, status, is_missing, dogId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: "Dog not found" });
    }

    res.json({ message: "Dog profile updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 6: DELETE DOG (Delete) ---
app.delete('/api/dog/:id', async (req, res) => {
  const dogId = req.params.id;

  try {
    // Note: Since we used ON DELETE CASCADE in our table schema for vaccination_records,
    // deleting the dog will automatically remove its vaccinations. 
    // However, for tables like activity_log without CASCADE, you'd usually delete those first.
    
    const result = await db.run('DELETE FROM dog_profile WHERE id = ?', [dogId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Dog not found" });
    }

    res.json({ message: "Dog and related records deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all vaccines for a dog
app.get('/api/dog/:dogId/vaccines', async (req, res) => {
  const records = await db.all('SELECT * FROM vaccination_records WHERE dog_id = ?', [req.params.dogId]);
  res.json(records);
});

// ADD a vaccine record
app.post('/api/dog/:dogId/vaccines', async (req, res) => {
  const { vaccine_type, date_administered, date_expires, provider_name, batch_number, document_url } = req.body;
  const id = `vac_${uuidv4().split('-')[0]}`;
  try {
    await db.run(
      `INSERT INTO vaccination_records (id, dog_id, vaccine_type, date_administered, date_expires, provider_name, batch_number, document_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.dogId, vaccine_type, date_administered, date_expires, provider_name, batch_number, document_url]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE a vaccine record
app.delete('/api/vaccine/:id', async (req, res) => {
  await db.run('DELETE FROM vaccination_records WHERE id = ?', [req.params.id]);
  res.json({ message: "Deleted" });
});


// GET all treatments for a dog
app.get('/api/dog/:dogId/treatments', async (req, res) => {
  const treatments = await db.all('SELECT * FROM medical_treatments WHERE dog_id = ?', [req.params.dogId]);
  res.json(treatments);
});

// ADD a treatment
app.post('/api/dog/:dogId/treatments', async (req, res) => {
  const { treatment_type, date, details, skin_condition, visible_injuries, signs_of_disease } = req.body;
  const id = `med_${uuidv4().split('-')[0]}`;
  try {
    await db.run(
      `INSERT INTO medical_treatments (id, dog_id, treatment_type, date, details, skin_condition, visible_injuries, signs_of_disease) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.dogId, treatment_type, date, details, skin_condition, visible_injuries, signs_of_disease]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE a treatment
app.put('/api/treatment/:id', async (req, res) => {
  const { details, skin_condition } = req.body;
  await db.run('UPDATE medical_treatments SET details = ?, skin_condition = ? WHERE id = ?', [details, skin_condition, req.params.id]);
  res.json({ message: "Updated" });
});


// GET caretakers for a dog
app.get('/api/dog/:dogId/caretakers', async (req, res) => {
  const caretakers = await db.all('SELECT * FROM caretakers WHERE dog_id = ?', [req.params.dogId]);
  res.json(caretakers);
});

// ADD a caretaker
app.post('/api/dog/:dogId/caretakers', async (req, res) => {
  const { name, contact_info, role } = req.body;
  const id = `ct_${uuidv4().split('-')[0]}`;
  await db.run(
    'INSERT INTO caretakers (id, dog_id, name, contact_info, role) VALUES (?, ?, ?, ?, ?)',
    [id, req.params.dogId, name, contact_info, role]
  );
  res.status(201).json({ id });
});

// REMOVE a caretaker
app.delete('/api/caretaker/:id', async (req, res) => {
  await db.run('DELETE FROM caretakers WHERE id = ?', [req.params.id]);
  res.json({ message: "Caretaker removed" });
});


// ----------------------------------------------------





app.listen(3000, () => console.log('Dog Tracker (SQLite): http://localhost:3000'));





// app.post('/api/log', async (req, res) => {
//   const { dogId, location } = req.body;

//   try {
//     await db.run(
//       'INSERT INTO interactions (dogId, location) VALUES (?, ?)',
//       [dogId, location]
//     );

//     const dog = await db.get('SELECT missing FROM dogs WHERE id = ?', [dogId]);
    
//     res.json({
//       status: "Logged",
//       alert: dog?.missing ? "Caretaker notified of scan!" : null
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // --- API 4: BULK EXPORT ---
// app.get('/api/export', async (req, res) => {
//   const dogs = await db.all('SELECT * FROM dogs');
//   const interactions = await db.all('SELECT * FROM interactions');
//   res.json({ dogs, interactions });
// });










// const express = require('express');
// const cors = require('cors');
// const { v4: uuidv4 } = require('uuid'); // Using a standard library for IDs

// const app = express();
// app.use(cors());
// app.use(express.json()); // Replaces manual body parsing chunks

// // IN-MEMORY DATABASE
// const db = {
//   dogs: new Map(), // Map is more efficient for lookups than a literal object
//   interactions: []
// };

// // --- API 1: TAG GENERATION & REGISTRATION ---
// app.post('/api/register', (req, res) => {
//   const { id, status, medicalBitfield, photo, caretakerId } = req.body;
//   const dogId = id || `dog_${uuidv4().split('-')[0]}`;

//   const newDog = {
//     id: dogId,
//     status: status || 'Street',
//     medicalBitfield: medicalBitfield || '00',
//     photo: photo || null,
//     caretakerId: caretakerId || null,
//     missing: false
//   };

//   db.dogs.set(dogId, newDog);
//   res.status(201).json({ message: "Dog registered", id: dogId });
// });

// // --- API 2: FETCH DOG PROFILE ---
// app.get('/api/dog/:id', (req, res) => {
//   const dog = db.dogs.get(req.params.id);
  
//   if (!dog) {
//     return res.status(404).json({ error: "Dog not found" });
//   }
//   res.json(dog);
// });

// // --- API 3: LOG INTERACTION & LOCATION ---
// app.post('/api/log', (req, res) => {
//   const interaction = {
//     ...req.body,
//     timestamp: new Date().toISOString()
//   };

//   db.interactions.push(interaction);

//   const dog = db.dogs.get(interaction.dogId);
//   const alertTriggered = dog?.missing;

//   res.json({
//     status: "Logged",
//     alert: alertTriggered ? "Caretaker notified of scan!" : null
//   });
// });

// // --- API 4: BULK DATA EXPORT ---
// app.get('/api/export', (req, res) => {
//   res.json({
//     dogs: Array.from(db.dogs.values()),
//     interactions: db.interactions
//   });
// });

// app.listen(3000, () => console.log('Dog Tracker API: http://localhost:3000'));
