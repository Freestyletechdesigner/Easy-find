'use strict';

const Project = require('../model/Project.js');
const { check, validationResult } = require('express-validator');

function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}

function PROJECTS(app) {

    // ── GET all projects ──────────────────────────────────────
    app.get('/api/admin/projects', requireAdmin, async (req, res) => {
        try {
            const projects = await Project.find().sort({ createdAt: -1 }).lean();
            res.json({ success: true, projects });
        } catch (err) {
            console.error('Error fetching projects:', err);
            res.status(500).json({ success: false, message: 'Error fetching projects' });
        }
    });

    // ── POST create project ───────────────────────────────────
    app.post('/api/admin/projects', requireAdmin, [
        check('title').notEmpty().trim().escape().isLength({ max: 120 }),
        check('description').optional({ checkFalsy: true }).trim().escape().isLength({ max: 500 }),
        check('status').optional().isIn(['todo', 'inprogress', 'review', 'done']),
        check('tag').optional({ checkFalsy: true }).trim().escape().isLength({ max: 30 }),
        check('tagColor').optional().isIn(['blue', 'green', 'orange', 'red', 'purple']),
        check('progress').optional().isInt({ min: 0, max: 100 }),
        check('initials').optional({ checkFalsy: true }).trim().escape().isLength({ max: 3 }),
        check('avatarColor').optional().isIn(['blue', 'green', 'orange', 'purple', 'red']),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }

        try {
            const { title, description, status, tag, tagColor, progress, initials, avatarColor } = req.body;
            const project = new Project({
                title,
                description: description || '',
                status:      status      || 'todo',
                tag:         tag         || 'General',
                tagColor:    tagColor    || 'blue',
                progress:    progress    ? parseInt(progress) : 0,
                initials:    initials    || 'AD',
                avatarColor: avatarColor || 'blue',
            });
            await project.save();
            res.status(201).json({ success: true, project });
        } catch (err) {
            console.error('Error creating project:', err);
            res.status(500).json({ success: false, message: 'Error creating project' });
        }
    });

    // ── PATCH update project (status, progress, or any field) ──
    app.patch('/api/admin/projects/:id', requireAdmin, [
        check('title').optional().trim().escape().isLength({ max: 120 }),
        check('description').optional().trim().escape().isLength({ max: 500 }),
        check('status').optional().isIn(['todo', 'inprogress', 'review', 'done']),
        check('tag').optional().trim().escape().isLength({ max: 30 }),
        check('tagColor').optional().isIn(['blue', 'green', 'orange', 'red', 'purple']),
        check('progress').optional().isInt({ min: 0, max: 100 }),
    ], async (req, res) => {
        try {
            const updates = { updatedAt: new Date() };
            const allowed = ['title', 'description', 'status', 'tag', 'tagColor', 'progress', 'initials', 'avatarColor'];
            allowed.forEach(field => {
                if (req.body[field] !== undefined) updates[field] = req.body[field];
            });

            const project = await Project.findByIdAndUpdate(
                req.params.id,
                updates,
                { new: true }
            );

            if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
            res.json({ success: true, project });
        } catch (err) {
            console.error('Error updating project:', err);
            res.status(500).json({ success: false, message: 'Error updating project' });
        }
    });

    // ── DELETE project ────────────────────────────────────────
    app.delete('/api/admin/projects/:id', requireAdmin, async (req, res) => {
        try {
            const project = await Project.findByIdAndDelete(req.params.id);
            if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
            res.json({ success: true, message: 'Project deleted' });
        } catch (err) {
            console.error('Error deleting project:', err);
            res.status(500).json({ success: false, message: 'Error deleting project' });
        }
    });
}

module.exports = PROJECTS;
