import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
const token = jwt.sign({uid: 'f366ca2f-7c7c-4185-ab2f-bffe3d31c6d6', email: 'shubham@conwiz.in', role: 'Subscriber'}, process.env.JWT_SECRET || 'your_jwt_secret_here', {expiresIn: '8h'});
fetch('http://localhost:3000/api/content/list?onlyUnlocked=true&domain=&page=1&limit=24', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(d => {
  console.log("Total returned items:", d.data?.length, "first item locked:", d.data?.[0]?.locked, "Total in DB:", d.total);
});
