const mongoose = require('mongoose');
const { ApifyClient } = require('apify-client');
const { GoogleGenAI } = require('@google/genai');
const AgentPost = require('../model/AgentPost.js'); 

// 1. Initialize Clients
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 });

const SCRAPER_AGENT_ID = process.env.SCRAPED_POSTS_AGENT_ID || 'facebook_scraper_system';

async function runPipeline() {
  const isAlreadyConnected = mongoose.connection.readyState === 1;

  try {
    if (!isAlreadyConnected) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Pipeline connected to MongoDB');
    } else {
      console.log('Pipeline reusing existing MongoDB connection');
    }

    console.log('Starting Facebook Scraper Actor...');
    const run = await apify.actor('apify/facebook-groups-scraper').call({
      startUrls: [
        { url: 'https://www.facebook.com/groups/308348807661635/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/624269623010248/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/1163335040867633/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/134608730468927/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/1582691668689207/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/901000727283894/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/1199008991517758/?ref=share&mibextid=NSMWBT' },
        { url: 'https://www.facebook.com/groups/308348807661635/?ref=share&mibextid=NSMWBT' }
      ],
      maxPosts: 10
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[DEBUG] Fetched ${items.length} raw posts from Apify.`);

    if (items.length === 0) {
      console.log('[DEBUG] No posts were returned by the scraper. Check if the group is public.');
      return;
    }

    // 4. Process Each Post with Gemini
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawText = item.text || item.caption || '';
      const postUrl = item.url || item.postUrl;

      console.log(`\n--- Processing Post ${i + 1}/${items.length} ---`);
      console.log(`Post URL: ${postUrl}`);

      if (!rawText || !postUrl) {
        console.log(`[DEBUG] Skipping Post ${i + 1} because rawText or postUrl is missing.`);
        continue;
      }

      // Escape special regex characters in the URL to prevent MongoDB search errors
      const escapedUrl = postUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const exists = await AgentPost.exists({
        description: { $regex: escapedUrl, $options: 'i' }
      });

      if (exists) {
        console.log(`[DEBUG] Post already exists in DB: ${postUrl}`);
        continue;
      }

      console.log(`[DEBUG] Sending text to Gemini AI for analysis...`);
      const prompt = `Extract real estate property listing details from this social media post.
      
Post Text:
"""
${rawText}
"""`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              isPropertyListing: { 
                type: 'boolean',
                description: 'Set to true if this post represents a real estate listing for sale, rent, or shortlet.'
              },
              title: { 
                type: 'string',
                description: 'A brief, clean title for the listing.'
              },
              type: { 
                type: 'string', 
                enum: ['house', 'apartment', 'land', 'villa', 'commercial'],
                description: 'Categorize the property type.'
              },
              category: { 
                type: 'string', 
                enum: ['sale', 'rent', 'shortlet'],
                description: 'Categorize the category.'
              },
              price: { 
                type: 'number',
                description: 'Numeric value of price. Ignore symbols and text.'
              },
              location: { 
                type: 'string',
                description: 'The location of the property.'
              },
              beds: { 
                type: 'number',
                description: 'Number of bedrooms.'
              },
              baths: { 
                type: 'number',
                description: 'Number of bathrooms.'
              },
              area: { 
                type: 'string',
                description: 'Size of the property (e.g. "120 sqm" or "2 plots"). Default to "0" if missing.'
              },
              description: { 
                type: 'string',
                description: 'A summary description extracted from the post text.'
              },
              features: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'List of features mentioned in the post.'
              }
            },
            required: ['isPropertyListing', 'title', 'type', 'category', 'location']
          }
        }
      });

      try {
        const data = JSON.parse(response.text);
        console.log(`[DEBUG] Gemini Analysis Result:`, JSON.stringify(data, null, 2));

        if (data.isPropertyListing) {
          const finalDescription = `${data.description || ''}\n\n[Source: ${postUrl}]`;
          const scrapedImages = item.images || item.photos || [];

          await AgentPost.create({
            agentId: SCRAPER_AGENT_ID,
            title: data.title,
            type: data.type,
            category: data.category,
            price: data.price,
            location: data.location,
            beds: data.beds || 0,
            baths: data.baths,
            area: data.area || '0',
            description: finalDescription,
            features: data.features || [],
            imageNames: scrapedImages,
            date: item.timestamp ? new Date(item.timestamp) : new Date()
          });
          
          console.log(`[SUCCESS] Saved new listing: "${data.title}"`);
        } else {
          console.log(`[DEBUG] Skipping: Post was analyzed but determined NOT to be a property listing.`);
        }
      } catch (parseError) {
        console.error('[ERROR] Failed to parse Gemini response or write to DB:', parseError);
        console.log('Gemini raw response text was:', response.text);
      }
    }

  } catch (error) {
    console.error('Pipeline Error:', error);
  } finally {
    if (!isAlreadyConnected) {
      await mongoose.disconnect();
      console.log('Pipeline run finished & disconnected.');
    } else {
      console.log('Pipeline run finished. Main app connection kept alive.');
    }
  }
}

module.exports = { runPipeline };

if (require.main === module) {
  runPipeline();
}