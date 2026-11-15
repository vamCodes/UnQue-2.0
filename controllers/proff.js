import {HttpError} from "../models/error.js"
import {Availability} from "../models/availability.js"
import { Appointment } from "../models/appointment.js";
import moment from "moment";
import mongoose from "mongoose";



// Controller to set availability
const setAvailability = async (req, res, next) => {
  try {
    console.log(req.user);  // Log req.user to see if it's coming through
    
    const { startTime, endTime } = req.body;
    
    if (!req.user || !req.user.id) {
      return next(new HttpError("No professor ID found", 400));
    }

    // Ensure startTime is before endTime
    if (new Date(startTime) >= new Date(endTime)) {
      return next(new HttpError("Start time must be before end time", 400));
    }

    // Check for overlapping availability
    const existingAvailability = await Availability.findOne({
      professorId: req.user.id,
      $or: [
        { startTime: { $lt: new Date(endTime) }, endTime: { $gt: new Date(startTime) } }, // Start overlaps
        { startTime: { $lt: new Date(startTime) }, endTime: { $gt: new Date(endTime) } }  // End overlaps
      ]
      // New time starts before an old one finishes
      // New time finishes after an old one start
    });

    if (existingAvailability) {
      return next(new HttpError("This time slot is already added for you professor", 400));
    }

    // Create new availability entry
    const availability = new Availability({
      professorId: req.user.id,  // Ensure that professorId is coming from req.user._id
      startTime,
      endTime,
    });

    await availability.save();

    const formattedStartTime = moment.utc(availability.startTime).format('MMMM Do YYYY, h:mm:ss a');
    const formattedEndTime = moment.utc(availability.endTime).format('MMMM Do YYYY, h:mm:ss a');

    res.status(201).json({
      message: "Availability added successfully",
      availability: {
        ...availability.toObject(),  // Spreading existing availability data
        startTime: formattedStartTime, // Replacing with formatted date
        endTime: formattedEndTime, // Replacing  with formatted date
      },
    });
  } catch (error) {
    console.log(error);  // Log error for better debugging
    return next(new HttpError("Adding availability failed", 500));
  }
};



  const cancelAppointments = async(req,res,next) => {
    try {
      const { studentId } = req.params;  // Student's ID from params
      const professorId = req.user.id;   // Professor's ID from the authenticated user
      console.log('Professor ID:', professorId);  // This should match the professor's ID in the appointment
      console.log('Student ID:', studentId);

      // Ensuring professor is authenticated and studentId is provided
      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return next(new HttpError("Invalid or missing student ID", 400));
      }
  
      // Finding the  appointments between this professor and student
      const appointments = await Appointment.find({
        studentId: new mongoose.Types.ObjectId(studentId),
        professorId: new mongoose.Types.ObjectId(professorId),
        status: 'booked' // Only cancel booked appointments
      });
  
      if (!appointments || appointments.length === 0) {
        return next(new HttpError("No appointments found to cancel", 404));
      }
  
      // Mark all booked appointments as 'cancelled' (must match the schema enum)
      await Appointment.updateMany(
        {
          studentId: new mongoose.Types.ObjectId(studentId),
          professorId: new mongoose.Types.ObjectId(professorId),
          status: 'booked'
        },
        { status: 'cancelled' }
      );

      res.status(200).json({
        message: `All appointments between professor ${professorId} and student ${studentId} have been cancelled.`
      });
  
    } catch (error) {
      console.error("Error cancelling appointments:", error);
      return next(new HttpError(error));
    }
  };
// Controller to update the timing of an existing FREE availability slot.
// The slot document is kept (not deleted); only startTime/endTime change.
const updateAvailability = async (req, res, next) => {
  try {
    const { availabilityId } = req.params;
    const { startTime, endTime } = req.body;
    const professorId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
      return next(new HttpError("Invalid availability ID", 400));
    }
    if (!startTime || !endTime || new Date(startTime) >= new Date(endTime)) {
      return next(new HttpError("A valid startTime and endTime (start before end) are required", 400));
    }
    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    // Only the professor who owns this slot can change it
    const slot = await Availability.findOne({
      _id: new mongoose.Types.ObjectId(availabilityId),
      professorId: new mongoose.Types.ObjectId(professorId),
    });
    if (!slot) {
      return next(new HttpError("Availability slot not found", 404));
    }

    // Only FREE slots can be updated: refuse if any booked appointment falls inside it
    const bookedCount = await Appointment.countDocuments({
      professorId: slot.professorId,
      status: 'booked',
      time: { $gte: slot.startTime, $lte: slot.endTime },
    });
    if (bookedCount > 0) {
      return next(new HttpError("This slot has booked appointments and cannot be updated", 409));
    }

    // The new timing must not overlap any OTHER availability slot of this professor
    const overlap = await Availability.findOne({
      professorId: slot.professorId,
      _id: { $ne: slot._id },
      startTime: { $lt: newEnd },
      endTime: { $gt: newStart },
    });
    if (overlap) {
      return next(new HttpError("New timing overlaps another availability slot", 400));
    }

    slot.startTime = newStart;
    slot.endTime = newEnd;
    await slot.save();

    res.status(200).json({
      message: "Availability updated successfully",
      availability: {
        _id: slot._id,
        professorId: slot.professorId,
        startTime: moment.utc(slot.startTime).format('MMMM Do YYYY, h:mm:ss a'),
        endTime: moment.utc(slot.endTime).format('MMMM Do YYYY, h:mm:ss a'),
      },
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    return next(new HttpError("Updating availability failed", 500));
  }
};

export {setAvailability, cancelAppointments, updateAvailability};