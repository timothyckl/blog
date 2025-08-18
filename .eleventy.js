import { DateTime } from "luxon";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

export default function (eleventyConfig) { 
  eleventyConfig.addPassthroughCopy("/src/assets/fonts/JetBrainMonoNerdFont-Regular.ttf");
  eleventyConfig.addPassthroughCopy("/src/assets/fonts/JetBrainMonoNerdFont-Bold.ttf");
  eleventyConfig.addPassthroughCopy("/src/assets/fonts/JetBrainMonoNerdFont-Italic.ttf");
  
  eleventyConfig.addPassthroughCopy("src/css");

  eleventyConfig.addFilter("formatDateMed", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.DATE_MED);
  });

  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.addCollection("categories", (collectionApi) => {
    let categories = new Set();
    let posts = collectionApi.getFilteredByTag('post');
    posts.forEach(p => {
      let cat = p.data.categories;
      cat.forEach(c => categories.add(c));
    });
    return Array.from(categories);
  });

  eleventyConfig.addFilter("filterByCategory", function(posts, cat) {
    cat = cat.toLowerCase();
    let result = posts.filter(p => {
      let cats = p.data.categories.map(s => s.toLowerCase());
      return cats.includes(cat);
    });
    return result;
  });

	return {
    dir: {
			input: 'src',
      output: '_site',
		}
	};
}
