require('dotenv')
const mongoose=require("mongoose")
const URI=process.env.MONGO_URI||"mongodb://localhost:27017/mernstack"

mongoose.connect(URI).then(()=>console.log("Connected to mongoDB")).catch((err)=>console.log(err))

module.exports=mongoose;
