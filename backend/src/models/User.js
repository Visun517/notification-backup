const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;
const { RECIPIENT_ROLES } = require('../constants/notificationConstants');

const userSchema = new Schema({
  tenantId: {
    type: String,
    default: "default",
    trim: true,
    index: true,
  },
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: 6
  },
  role: {
  type: String,
  enum: Object.values(RECIPIENT_ROLES),
  required: true
},
  contactNumber: {
    type: String,
    trim: true
  },

  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
  },
  
  fcmToken: {
    type: String,
    default: null
  },

  showCurrentLocation: {
    type: Boolean,
    default: true,
  },

  notificationPreferences: {
    channels: {
      type: Map,
      of: Boolean,
      default: {
        IN_APP: true,
        PUSH: true,
        EMAIL: true,
        SMS: true,
        WEBHOOK: true,
      },
    },
  },

  touristDetails: {
    country: String,
    languagePreference: { type: String, default: 'en' },
    travelPreferences: [String], 
    emergencyContact: {
      name: String,
      phone: String
    }
  },

  driverDetails: {
    vehicleName: String,
    vehicleNumber: String,
    vehicleColor: String,
    licenseNumber: String,
    availability: { type: Boolean, default: false },
    rating: { type: Number, default: 5 }
  }

}, {
  timestamps: true 
});

/**
 * Indexes
 */
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ tenantId: 1, email: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);