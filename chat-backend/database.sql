-- PostgreSQL Schema for Chat & Social Network Service

-- Drop tables if they exist (for clean migration)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS user_fcm_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. User FCM Tokens Table (For push notifications on multiple devices)
CREATE TABLE user_fcm_tokens (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    PRIMARY KEY (user_id, token)
);

-- 3. Friendships Table
CREATE TABLE friendships (
    user_id_1 INT REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 INT REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- 'pending', 'accepted'
    action_user_id INT REFERENCES users(id) ON DELETE CASCADE, -- User who initiated the action (sent request)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id_1, user_id_2),
    CONSTRAINT user_id_order_check CHECK (user_id_1 < user_id_2)
);

-- Index for fast user list retrieval
CREATE INDEX idx_friendships_user1 ON friendships(user_id_1);
CREATE INDEX idx_friendships_user2 ON friendships(user_id_2);

-- 4. Messages Table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INT REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast chat history query between two users (sorted by time)
CREATE INDEX idx_messages_chat ON messages(sender_id, receiver_id, created_at DESC);
