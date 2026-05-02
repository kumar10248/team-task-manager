const express=require("express")
const app= express()
require("dotenv").config()
require("./src/config/db")

const PORT= process.env.PORT || 5000
app.listen(PORT,()=>{
    console.log(`Server is running at PORT ${PORT}`)
})