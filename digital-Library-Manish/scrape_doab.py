import requests
import csv
import json

print("Starting to scrape DOAB via REST...")
url = "https://directory.doabooks.org/rest/search?query=architecture&expand=metadata"

try:
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    if response.status_code != 200:
        print("Failed to fetch:", response.status_code, response.text)
        import sys; sys.exit(1)

    # Note: Sometimes the structure is different depending on the endpoint variant.
    data = response.json()
    items = []
    
    # Try different JSON paths because DOAB might use DSpace 6 vs DSpace 7 formatting
    if type(data) is list:
        objects = data
    elif "objects" in data:
        objects = data["objects"]
    else:
        # DSpace 6 style maybe
        objects = [data] if "metadata" in data else []
        for key in data:
            if type(data[key]) is list and len(data[key]) > 0 and 'metadata' in data[key][0]:
                objects = data[key]
                break

    print(f"Rough detection: {len(objects)} results in initial probe")
    
    books = []
    for obj in objects:
        metadata = obj.get('metadata', [])
        if type(metadata) is dict:
             # Convert to list if it's stored differently
             md_list = []
             for k,v in metadata.items():
                 for item in v: md_list.append({"key": k, "value": item.get('value')})
             metadata = md_list
             
        title = "Unknown Title"
        authors = []
        publisher = "Unknown Publisher"
        year = ""
        handle = obj.get('handle', '')
        
        for m in metadata:
            k = m.get('key')
            v = m.get('value')
            if k == 'dc.title': title = v
            elif k == 'dc.contributor.author': authors.append(v)
            elif k == 'dc.publisher': publisher = v
            elif k == 'dc.date.issued': year = v[:4] if v else ""

        url_str = f"https://directory.doabooks.org/handle/{handle}" if handle else ""
        
        if title != "Unknown Title":
            books.append({
                "title": title,
                "authors": ", ".join(authors),
                "publisher": publisher,
                "publicationYear": year,
                "contentType": "Books",
                "domain": "Architecture",
                "url": url_str
            })

    if len(books) == 0:
        # DSpace 6 REST search API looks like this:
        # data may have `[{"handle": "...", "name": "..."}]` but `expand=metadata` must be parsed.
        pass

    with open("architecture_books.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "authors", "publisher", "publicationYear", "contentType", "domain", "url"])
        writer.writeheader()
        writer.writerows(books)
    print(f"Saved {len(books)} books to architecture_books.csv")

except Exception as e:
    import traceback
    traceback.print_exc()
