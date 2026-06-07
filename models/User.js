const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    balance: {
        type: Number,
        default: 0
    },
    credits: {
        type: Number,
        default: 0
    },
    lastFreeSpin: {
        type: Date,
        default: null
    },
    role: {
        type: String,
        enum: ['client', 'cashier', 'admin'],
        default: 'client'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
    lastWithdrawal: { 
    type: Date, 
    default: null 
}
});

module.exports = mongoose.model('User', userSchema);
