import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Every document uses the client's string id as its primary key. */
const baseSchema = (definition, { collection, indexes = [] } = {}) => {
  const schema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      ...definition,
    },
    { timestamps: false, versionKey: false, _id: false, collection },
  );
  indexes.forEach(([fields, options]) => schema.index(fields, options));
  return schema;
};

const Room = model(
  'Room',
  baseSchema(
    {
      number: { type: String, required: true },
      type: { type: String, required: true },
      audience: { type: String, default: 'mixed' },
      floor: { type: Number, default: 0 },
      bedCount: { type: Number, required: true },
      pricePerBed: { type: Number, required: true },
      amenities: { type: [String], default: [] },
      notes: { type: String, default: '' },
      createdAt: { type: String },
    },
    { collection: 'rooms' },
  ),
);

const Bed = model(
  'Bed',
  baseSchema(
    {
      roomId: { type: String, required: true, index: true },
      number: { type: Number, required: true },
      label: { type: String, required: true },
      cleaning: { type: Boolean, default: false },
      maintenance: { type: Boolean, default: false },
      outOfService: { type: Boolean, default: false },
      note: { type: String, default: '' },
    },
    { collection: 'beds' },
  ),
);

const Guest = model(
  'Guest',
  baseSchema(
    {
      name: { type: String, required: true },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      nationality: { type: String, default: '' },
      idType: { type: String, default: 'passport' },
      idNumber: { type: String, default: '' },
      notes: { type: String, default: '' },
      createdAt: { type: String },
    },
    { collection: 'guests' },
  ),
);

const Reservation = model(
  'Reservation',
  baseSchema(
    {
      reference: { type: String, required: true, unique: true, index: true },
      guestId: { type: String, required: true, index: true },
      roomId: { type: String, required: true, index: true },
      bedId: { type: String, required: true, index: true },
      arrival: { type: String, required: true, index: true },
      departure: { type: String, required: true, index: true },
      guests: { type: Number, default: 1 },
      rate: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      total: { type: Number, required: true },
      source: { type: String, default: 'direct' },
      status: { type: String, default: 'confirmed', index: true },
      notes: { type: String, default: '' },
      createdAt: { type: String },
      createdBy: { type: String, default: '' },
      updatedAt: { type: String },
      checkedInAt: { type: String },
      checkedOutAt: { type: String },
    },
    { collection: 'reservations' },
  ),
);

const Payment = model(
  'Payment',
  baseSchema(
    {
      reservationId: { type: String, required: true, index: true },
      guestId: { type: String, required: true },
      amount: { type: Number, required: true },
      method: { type: String, default: 'card' },
      type: { type: String, default: 'payment' },
      date: { type: String, required: true, index: true },
      reference: { type: String, required: true },
      notes: { type: String, default: '' },
      createdAt: { type: String },
      createdBy: { type: String, default: '' },
    },
    { collection: 'payments' },
  ),
);

const Expense = model(
  'Expense',
  baseSchema(
    {
      category: { type: String, required: true, index: true },
      vendor: { type: String, required: true },
      date: { type: String, required: true, index: true },
      amount: { type: Number, required: true },
      method: { type: String, default: 'card' },
      receipt: { type: String, default: '' },
      notes: { type: String, default: '' },
      createdAt: { type: String },
    },
    { collection: 'expenses' },
  ),
);

const Task = model(
  'Task',
  baseSchema(
    {
      type: { type: String, default: 'cleaning' },
      title: { type: String, required: true },
      roomId: { type: String, required: true, index: true },
      priority: { type: String, default: 'medium' },
      status: { type: String, default: 'open', index: true },
      assigneeId: { type: String, default: null },
      due: { type: String, required: true },
      description: { type: String, default: '' },
      createdAt: { type: String },
    },
    { collection: 'tasks' },
  ),
);

const Staff = model(
  'Staff',
  baseSchema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, unique: true },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, default: 'receptionist' },
      status: { type: String, default: 'active' },
      lastActive: { type: String, default: null },
      invitedAt: { type: String },
    },
    { collection: 'staff' },
  ),
);

const Notification = model(
  'Notification',
  baseSchema(
    {
      type: { type: String, required: true },
      data: { type: Schema.Types.Mixed, default: {} },
      read: { type: Boolean, default: false },
      createdAt: { type: String },
    },
    { collection: 'notifications' },
  ),
);

const Setting = model(
  'Setting',
  new Schema(
    {
      key: { type: String, required: true, unique: true },
      data: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: false, versionKey: false, collection: 'settings' },
  ),
);

export const models = {
  Room,
  Bed,
  Guest,
  Reservation,
  Payment,
  Expense,
  Task,
  Staff,
  Notification,
  Setting,
};
