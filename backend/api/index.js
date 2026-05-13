const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

// 1. INITIALIZE FIREBASE (Serverless Singleton Pattern)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Fix for private key newline characters in environment variables
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// --- HELPERS ---
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// --- API 1: REGISTER DOG ---
app.post('/api/register', async (req, res) => {
  const { id, name, photo_url, sex, species, age_group, sterilization_status, vaccination_bit_mask, status, is_missing } = req.body;
  const dogId = id || `dog_${uuidv4().split('-')[0]}`;

  try {
    const dogData = {
      name: name || 'Unnamed',
      photo_url: photo_url || null,
      sex: sex || 'Unknown',
      species: species || 'Unknown',
      age_group: age_group || 'Unknown',
      sterilization_status: sterilization_status || 'Unknown',
      vaccination_bit_mask: vaccination_bit_mask || 0,
      status: status || 'Street',
      is_missing: !!is_missing,
      created_at: serverTimestamp()
    };

    await db.collection('dog_profile').doc(dogId).set(dogData);
    res.status(201).json({ message: "Dog registered", id: dogId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 2: FETCH DOG PROFILE WITH ACTIVITY LOGGING ---
app.get('/api/dog/:id', async (req, res) => {
  const dogId = req.params.id;
  const { lat, lon, contributor } = req.query;
  const gpsLocation = (lat && lon) ? `${lat},${lon}` : 'Unknown';

  try {
    const doc = await db.collection('dog_profile').doc(dogId).get();
    if (!doc.exists) return res.status(404).json({ error: "Dog not found" });

    // Auto-log the view
    await db.collection('activity_log').add({
      dog_id: dogId,
      event_type: 'PROFILE_VIEW',
      timestamp: serverTimestamp(),
      gps_location: gpsLocation,
      status_observed: 'Sighted',
      notes: 'Profile viewed via mobile app',
      contributor_id: contributor || 'System'
    });

    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 3: MANUAL LOG ACTIVITY ---
app.post('/api/log-activity', async (req, res) => {
  const { dog_id, event_type, lat, lon, status_observed, notes, contributor_id } = req.body;
  if (!dog_id) return res.status(400).json({ error: "dog_id is required" });

  try {
    const logData = {
      dog_id,
      event_type: event_type || 'MANUAL_LOG',
      timestamp: serverTimestamp(),
      gps_location: (lat && lon) ? `${lat},${lon}` : 'Unknown',
      status_observed: status_observed || 'Unknown',
      notes: notes || '',
      contributor_id: contributor_id || 'Anonymous'
    };
    const newLog = await db.collection('activity_log').add(logData);
    res.status(201).json({ message: "Activity logged", log_id: newLog.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 4: GET ACTIVITY LOGS ---
app.get('/api/dog/:id/activities', async (req, res) => {
  try {
    const snapshot = await db.collection('activity_log')
      .where('dog_id', '==', req.params.id)
      .orderBy('timestamp', 'desc')
      .get();
    const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ dog_id: req.params.id, total_logs: activities.length, activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 5: LIST ALL DOGS ---
app.get('/api/dogs', async (req, res) => {
  try {
    const snapshot = await db.collection('dog_profile').get();
    const dogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(dogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 6: UPDATE DOG PROFILE ---
app.put('/api/dog/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    delete updateData.id; // Ensure we don't accidentally overwrite the ID field inside the doc
    await db.collection('dog_profile').doc(req.params.id).update(updateData);
    res.json({ message: "Dog profile updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API 7: DELETE DOG ---
app.delete('/api/dog/:id', async (req, res) => {
  try {
    await db.collection('dog_profile').doc(req.params.id).delete();
    // Logic for deleting related logs/vaccines would go here if using a flat structure
    res.json({ message: "Dog profile deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- VACCINATION RECORDS ---
app.get('/api/dog/:dogId/vaccines', async (req, res) => {
  try {
    const snapshot = await db.collection('vaccination_records').where('dog_id', '==', req.params.dogId).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dog/:dogId/vaccines', async (req, res) => {
  try {
    const data = { ...req.body, dog_id: req.params.dogId };
    const docRef = await db.collection('vaccination_records').add(data);
    res.status(201).json({ id: docRef.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/vaccine/:id', async (req, res) => {
  await db.collection('vaccination_records').doc(req.params.id).delete();
  res.json({ message: "Deleted" });
});

// --- MEDICAL TREATMENTS ---
app.get('/api/dog/:dogId/treatments', async (req, res) => {
  try {
    const snapshot = await db.collection('medical_treatments').where('dog_id', '==', req.params.dogId).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dog/:dogId/treatments', async (req, res) => {
  try {
    const data = { ...req.body, dog_id: req.params.dogId };
    const docRef = await db.collection('medical_treatments').add(data);
    res.status(201).json({ id: docRef.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/treatment/:id', async (req, res) => {
  try {
    await db.collection('medical_treatments').doc(req.params.id).update(req.body);
    res.json({ message: "Updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CARETAKERS ---
app.get('/api/dog/:dogId/caretakers', async (req, res) => {
  try {
    const snapshot = await db.collection('caretakers').where('dog_id', '==', req.params.dogId).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dog/:dogId/caretakers', async (req, res) => {
  try {
    const data = { ...req.body, dog_id: req.params.dogId };
    const docRef = await db.collection('caretakers').add(data);
    res.status(201).json({ id: docRef.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/caretaker/:id', async (req, res) => {
  try {
    await db.collection('caretakers').doc(req.params.id).delete();
    res.json({ message: "Caretaker removed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

