# frozen_string_literal: true

# Exposes the Markdown source of every page and collection document as
# `raw_content`, before anything is rendered. /llms-full.txt uses it to give AI
# assistants the text as written, instead of rendered HTML or stripped text.
# Liquid in that source is not rendered: tests/e2e/geo.spec.js fails if a tag
# reaches /llms.txt or /llms-full.txt.
Jekyll::Hooks.register :site, :pre_render do |site|
  (site.pages + site.documents).each do |item|
    item.data['raw_content'] = item.content.to_s.strip
  end
end
